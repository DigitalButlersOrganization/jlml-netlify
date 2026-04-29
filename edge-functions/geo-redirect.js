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

    // если уже на локали — ничего не делаем
    if (firstPartLower && supported.has(firstPartLower)) {
        return context.next();
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

    const targetPath = path === "/" ? `/${locale}/` : `/${locale}${path}`;
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
