/* =========================================================================
   CVlight — views/shared.js
   Helpers compartidos entre vistas (ranking/chat) para reducir duplicados.
   ========================================================================= */
window.CV = window.CV || {};
CV.views = CV.views || {};
CV.util = CV.util || {};
(function (CV) {
  "use strict";

  function resolveJob(jobs, jobId) {
    var list = Array.isArray(jobs) ? jobs : [];
    if (jobId) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === jobId) return jobId;
      }
    }
    if (list.length && list[0] && list[0].id) return list[0].id;
    return null;
  }

  function emptyPanel(title, extra) {
    if (CV.util.emptyBox) return CV.util.emptyBox(title, extra);
    return '<div class="empty"><span class="empty-title">' + title + '</span><p>' + (extra || "") + '</p></div>';
  }

  CV.views.shared = CV.views.shared || {};
  CV.views.shared.resolveJob = resolveJob;
  CV.views.shared.emptyPanel = emptyPanel;
})(window.CV);