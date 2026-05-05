export default async (request, context) => {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = url.pathname;

    // Redirect only safe methods.
    if (method !== "GET" && method !== "HEAD") {
        return context.next();
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

    const country = (context.geo?.country?.code || "XX").toUpperCase();
    const isMx = country === "MX";

    // Only these 4 routes are used:
    // PE: / and /lessons
    // MX: /mx and /mx-lessons
    const routeTargets = {
        "/": isMx ? "/mx" : "/",
        "/mx": isMx ? "/mx" : "/",
        "/lessons": isMx ? "/mx-lessons" : "/lessons",
        "/mx-lessons": isMx ? "/mx-lessons" : "/lessons",
    };

    const targetPath = routeTargets[path];
    if (!targetPath || targetPath === path) {
        const response = await context.next();
        return rewriteOriginLocation(response, url);
    }

    const targetUrl = new URL(request.url);
    targetUrl.pathname = targetPath;

    return redirect(targetUrl);
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

    const originHosts = new Set(["jlml-wf.indrive.com", "jlml.indrive.com", "jlml.dbutlers.com"]);
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

function redirect(url) {
    return new Response(null, {
        status: 302,
        headers: {
            Location: url.toString(),
            "Cache-Control": "private, no-store",
        },
    });
}
