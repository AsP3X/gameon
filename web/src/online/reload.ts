/* "Reload to update": the server no longer speaks this page's protocol (`PROTOCOL_UNSUPPORTED`).
   The page is asked for again from the network, which is where the service worker gets it too
   (src/sw.ts), so what comes back is the page the server now expects. */
export const reloadPage = (): void => location.reload();
