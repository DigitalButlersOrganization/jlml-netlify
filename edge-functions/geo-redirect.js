export default async (request, context) => {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = url.pathname;

    // Redirect only safe methods to avoid changing POST/PUT semantics.
    if (method !== "GET" && method !== "HEAD") {
        return context.next();
    }

    const country = context.geo?.country?.code || "XX";

    const cookie = request.headers.get("cookie") || "";
    const manualLocale = (getCookie(cookie, "site_locale") || "").toLowerCase();
    const queryCountry = (url.searchParams.get("country") || "").toLowerCase();

    const localeMap = {
        PE: "pe",
        CO: "co",
        MX: "mx",
    };

    const supported = new Set(["pe", "co", "mx"]);
    const defaultLocale = "pe";

    const pathParts = path.split("/").filter(Boolean);
    const firstPart = pathParts[0];
    const firstPartLower = firstPart ? firstPart.toLowerCase() : "";

    // Default locale is canonical on root: /pe -> / and /pe/x -> /x
    if (firstPartLower === defaultLocale) {
        const restPath = pathParts.slice(1).join("/");
        const canonicalPath = restPath ? `/${restPath}` : "/";
        const canonicalUrl = new URL(request.url);
        canonicalUrl.pathname = canonicalPath;
        canonicalUrl.searchParams.delete("country");

        if (canonicalUrl.pathname !== path || canonicalUrl.search !== url.search) {
            return new Response(null, {
                status: 302,
                headers: {
                    Location: canonicalUrl.toString(),
                    "Cache-Control": "private, no-store",
                },
            });
        }
    }

    // если уже на локали — ничего не делаем
    if (firstPartLower && supported.has(firstPartLower)) {
        const response = await context.next();
        return rewriteOriginLocation(response, url);
    }

    // не трогаем служебные файлы
    if (
        path.startsWith("/.netlify/") ||
        path.startsWith("/.well-known/") ||
        path === "/favicon.ico" ||
        path === "/robots.txt" ||
        path === "/sitemap.xml" ||
        /\.[a-zA-Z0-9]{2,8}$/.test(path)
    ) {
        return context.next();
    }

    const locale =
        supported.has(queryCountry)
            ? queryCountry
            : supported.has(manualLocale)
                ? manualLocale
                : (localeMap[country] || defaultLocale);

    if (locale === defaultLocale) {
        if (url.searchParams.has("country")) {
            const canonicalUrl = new URL(request.url);
            canonicalUrl.searchParams.delete("country");

            if (canonicalUrl.search !== url.search) {
                return new Response(null, {
                    status: 302,
                    headers: {
                        Location: canonicalUrl.toString(),
                        "Cache-Control": "private, no-store",
                    },
                });
            }
        }

        const response = await context.next();
        return rewriteOriginLocation(response, url);
    }

    const targetPath = path === "/" ? `/${locale}` : `/${locale}${path}`;
    const targetUrl = new URL(request.url);
    targetUrl.pathname = targetPath;
    targetUrl.searchParams.delete("country");

    if (targetUrl.pathname === path) {
        return context.next();
    }

    return new Response(null, {
        status: 302,
        headers: {
            Location: targetUrl.toString(),
            "Cache-Control": "private, no-store",
        },
    });
};

export const config = {
    path: "/*",
};

function getCookie(cookieHeader, name) {
    for (const part of cookieHeader.split(";")) {
        const [k, ...v] = part.trim().split("=");
        if (k === name) {
            try {
                return decodeURIComponent(v.join("="));
            } catch {
                return null;
            }
        }
    }
    return null;
}

function rewriteOriginLocation(response, requestUrl) {
    if (!isRedirectStatus(response.status)) {
        return response;
    }

    const location = response.headers.get("location");
    if (!location) {
        return response;
    }

    let locationUrl;
    try {
        locationUrl = new URL(location, requestUrl.toString());
    } catch {
        return response;
    }

    const originHosts = new Set(["jlml-wf.indrive.com"]);
    if (!originHosts.has(locationUrl.hostname)) {
        return response;
    }

    const publicUrl = new URL(requestUrl.toString());
    publicUrl.pathname = locationUrl.pathname;
    publicUrl.search = locationUrl.search;
    publicUrl.hash = locationUrl.hash;

    const headers = new Headers(response.headers);
    headers.set("Location", publicUrl.toString());

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function isRedirectStatus(status) {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
