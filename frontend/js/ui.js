/* =========================================================================
   CVlight — ui.js
   Diálogo de confirmación reutilizable para acciones destructivas.

   Se construye una sola vez sobre el elemento nativo <dialog>: showModal() da
   gratis el foco atrapado, el cierre con Esc y el ::backdrop (top layer). El
   <form method="dialog"> hace que cada botón fije el returnValue del diálogo
   al cerrarse, así no hace falta cablear "Cancelar" ni el click de fondo.

   Uso:
     const ok = await CV.ui.confirm({
       title: "Eliminar vacante",
       message: "¿Eliminar «…»? Esta acción no se puede deshacer.",
       confirmLabel: "Eliminar",
     });
     if (!ok) return;
   ========================================================================= */
window.CV = window.CV || {};
(function (CV) {
  "use strict";

  let dialog = null;
  let settle = null; // resolve de la promesa pendiente

  function build() {
    const d = document.createElement("dialog");
    d.className = "confirm";
    d.setAttribute("aria-labelledby", "confirm-title");
    d.setAttribute("aria-describedby", "confirm-msg");
    d.innerHTML =
      '<form method="dialog" class="confirm-box">' +
        '<h2 class="confirm-title" id="confirm-title"></h2>' +
        '<p class="confirm-msg" id="confirm-msg"></p>' +
        '<div class="btn-row confirm-actions">' +
          '<button class="btn ghost" type="submit" value="cancel">Cancelar</button>' +
          '<button class="btn danger" type="submit" value="ok">Eliminar</button>' +
        '</div>' +
      '</form>';

    // Cualquier cierre (confirmar, cancelar o Esc) resuelve la promesa.
    d.addEventListener("close", () => {
      if (!settle) return;
      const done = settle;
      settle = null;
      done(d.returnValue === "ok");
    });

    document.body.appendChild(d);
    return d;
  }

  function confirm(opts) {
    const o = opts || {};

    // Un diálogo modal ya abierto bloquearía showModal(): anteponemos que no.
    if (dialog && dialog.open) return Promise.resolve(false);
    if (!dialog) dialog = build();

    dialog.querySelector("#confirm-title").textContent = o.title || "Confirmá la acción";
    dialog.querySelector("#confirm-msg").textContent = o.message || "";
    dialog.querySelector('button[value="ok"]').textContent = o.confirmLabel || "Confirmar";

    const cancel = dialog.querySelector('button[value="cancel"]');
    cancel.textContent = o.cancelLabel || "Cancelar";
    cancel.setAttribute("autofocus", "");

    return new Promise((resolve) => {
      settle = resolve;
      // El returnValue sobrevive entre aperturas: Esc lo limpia, pero close()
      // sin argumentos NO (conserva el "ok" anterior). Se limpia a mano para que
      // un cierre sin valor nunca se lea como confirmación.
      dialog.returnValue = "";
      dialog.showModal();
      // El foco arranca en la opción segura: si la acción es irreversible, un
      // Enter reflejo no debería confirmarla.
      cancel.focus();
    });
  }

  CV.ui = { confirm };
})(window.CV);
