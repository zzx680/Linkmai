// Bridge for the shell's own pages (the connection screen). The LinkMai web app
// itself gets no privileged APIs — it must behave identically in a browser —
// with one deliberate exception: guestCredentials, which the login page uses
// to offer "Continue as guest" in local mode. It is read-only and gated
// main-side to local mode + the local frontend's origin.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("linkmaiDesktop", {
  getServerUrl: () => ipcRenderer.invoke("linkmai:get-server-url"),
  setServerUrl: (url) => ipcRenderer.invoke("linkmai:set-server-url", url),
  retry: () => ipcRenderer.invoke("linkmai:retry"),
  // Local mode (self-contained stack). startLocal is gated main-side to the
  // shell's own pages; localAvailable and onLocalStatus are read-only.
  localAvailable: () => ipcRenderer.invoke("linkmai:local-available"),
  startLocal: () => ipcRenderer.invoke("linkmai:start-local"),
  chooseCloud: () => ipcRenderer.invoke("linkmai:choose-cloud"),
  guestCredentials: () => ipcRenderer.invoke("linkmai:guest-credentials"),
  openConnect: () => ipcRenderer.invoke("linkmai:open-connect"),
  onLocalStatus: (cb) =>
    ipcRenderer.on("linkmai:local-status", (_event, msg) => cb(String(msg))),
});
