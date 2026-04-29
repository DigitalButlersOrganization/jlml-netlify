export default async (request, context) => {
    const url = new URL(request.url);
    const country = context.geo?.country?.code || "XX";

    const cookie = request.headers.get("cookie") || "";
    const manualLocale = getCookie(cookie, "site_locale");

    const localeMap = {
        PE: "pe",
        CO: "co",
        MX: "mx",
    };

    const supported = new Set(["pe", "co", "mx"]);
    const defaultLocale = "pe";

    const pathParts = url.pathname.split("/").filter(Boolean);
    const firstPart = pathParts[0];

    // если уже на локали — ничего не делаем
    if (firstPart && supported.has(firstPart)) {
        return context.next();
    }

    // не трогаем служебные файлы
    if (
        url.pathname.startsWith("/.netlify/") ||
        url.pathname === "/favicon.ico" ||
        url.pathname === "/robots.txt" ||
        url.pathname === "/sitemap.xml" ||
        /\.[a-zA-Z0-9]{2,8}$/.test(url.pathname)
    ) {
        return context.next();
    }

    const locale =
        supported.has(manualLocale) ? manualLocale : (localeMap[country] || defaultLocale);

    const targetPath =
        url.pathname === "/" ? `/${locale}/` : `/${locale}${url.pathname}`;

    return Response.redirect(`${url.origin}${targetPath}`, 302);
};

export const config = {
    path: "/*",
};

function getCookie(cookieHeader, name) {
    for (const part of cookieHeader.split(";")) {
        const [k, ...v] = part.trim().split("=");
        if (k === name) return decodeURIComponent(v.join("="));
    }
    return null;
}
