var LINKMAI_WORKBENCH_URL = "https://linkmai.com/assistant";
var LINKMAI_TASKPANE_KEY = "linkmai_taskpane_id";

function OnAddinLoad(ribbonUI) {
  window.Application.ribbonUI = ribbonUI;
  return true;
}

function OnAction(control) {
  if (control.Id !== "btnOpenLinkMai") {
    return true;
  }

  var id = window.Application.PluginStorage.getItem(LINKMAI_TASKPANE_KEY);
  if (!id) {
    var taskpane = window.Application.CreateTaskPane(LINKMAI_WORKBENCH_URL);
    window.Application.PluginStorage.setItem(LINKMAI_TASKPANE_KEY, taskpane.ID);
    taskpane.Visible = true;
    return true;
  }

  var existing = window.Application.GetTaskPane(id);
  existing.Visible = !existing.Visible;
  return true;
}
