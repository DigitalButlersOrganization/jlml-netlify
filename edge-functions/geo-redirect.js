export default async (request, context) => {
    const url = new URL(request.url);
    const canonicalHost = "jlml.indrive.com";
    const method = request.method.toUpperCase();
    const path = url.pathname;

    // Redirect only safe methods.
    if (method !== "GET" && method !== "HEAD") {
        return context.next();
    }

    // Enforce canonical production host.
    if (
        url.hostname !== canonicalHost &&
        url.hostname !== "localhost" &&
        url.hostname !== "127.0.0.1" &&
        !url.hostname.endsWith(".netlify.app")
    ) {
        const canonicalUrl = new URL(request.url);
        canonicalUrl.protocol = "https:";
        canonicalUrl.hostname = canonicalHost;
        canonicalUrl.port = "";
        return redirect(canonicalUrl);
    }

    // Do not touch service files and internal paths.
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

    // Manual override from URL (e.g. ?region=mx or ?region=pe).
    const regionParam = normalizeLocale(url.searchParams.get("region"));
    if (regionParam) {
        const canonicalUrl = new URL(request.url);
        canonicalUrl.searchParams.delete("region");

        const targetPath = mapPathForLocale(path, regionParam);
        if (targetPath) {
            canonicalUrl.pathname = targetPath;
        }

        const response = redirect(canonicalUrl);
        setLocaleCookie(response, regionParam);
        return response;
    }

    // If user explicitly opens locale-specific pages, persist that choice.
    if (path === "/mx" || path === "/mx-lessons") {
        const response = await context.next();
        setLocaleCookie(response, "mx");
        return rewriteOriginLocation(response, url);
    }

    // User chose PE pages explicitly.
    if (path === "/" || path === "/lessons") {
        const localeCookie = readLocaleCookie(context);
        if (localeCookie === "pe") {
            const response = await context.next();
            return rewriteOriginLocation(response, url);
        }
    }

    const forcedLocale = readLocaleCookie(context);
    const country = (context.geo?.country?.code || "XX").toUpperCase();
    const effectiveLocale = forcedLocale || (country === "MX" ? "mx" : "pe");

    // Only these 4 routes are used:
    // PE: / and /lessons
    // MX: /mx and /mx-lessons
    const routeTargets = {
        "/": effectiveLocale === "mx" ? "/mx" : "/",
        "/mx": effectiveLocale === "mx" ? "/mx" : "/",
        "/lessons": effectiveLocale === "mx" ? "/mx-lessons" : "/lessons",
        "/mx-lessons": effectiveLocale === "mx" ? "/mx-lessons" : "/lessons",
    };

    const targetPath = routeTargets[path];
    if (!targetPath || targetPath === path) {
        const response = await context.next();
        return rewriteOriginLocation(response, url);
    }

    const targetUrl = new URL(request.url);
    targetUrl.pathname = targetPath;

    const response = redirect(targetUrl);
    if (forcedLocale) {
        setLocaleCookie(response, forcedLocale);
    }
    return response;
};

export const config = { path: "/*" };

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

    const originHosts = new Set(["jlml-wf.indrive.com", "jlml.indrive.com"]);
    if (!originHosts.has(locationUrl.hostname)) {
        return response;
    }

    const publicUrl = new URL(requestUrl.toString());
    publicUrl.protocol = "https:";
    publicUrl.hostname = "jlml.indrive.com";
    publicUrl.port = "";
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

function redirect(url) {
    return new Response(null, {
        status: 302,
        headers: {
            Location: url.toString(),
            "Cache-Control": "private, no-store",
        },
    });
}

function normalizeLocale(value) {
    if (!value) return null;
    const v = String(value).toLowerCase();
    if (v === "mx" || v === "pe") return v;
    return null;
}

function mapPathForLocale(path, locale) {
    if (path === "/" || path === "/mx") {
        return locale === "mx" ? "/mx" : "/";
    }
    if (path === "/lessons" || path === "/mx-lessons") {
        return locale === "mx" ? "/mx-lessons" : "/lessons";
    }
    return null;
}

function readLocaleCookie(context) {
    const cookie = context.cookies?.get?.("site_locale");
    const value = typeof cookie === "string" ? cookie : cookie?.value;
    return normalizeLocale(value);
}

function setLocaleCookie(response, locale) {
    response.headers.append(
        "Set-Cookie",
        `site_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`
    );
}
