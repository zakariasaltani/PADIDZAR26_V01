// public/js/forbidden.js

function showForbidden(message = "L’accès à cette section vous est interdit") {
  // Essaye de cibler un conteneur principal si tu en as un
  const container =
    document.querySelector("#main-content") ||
    document.querySelector(".container") ||
    document.body;

  container.innerHTML = `
    <div style="
      min-height: 60vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    ">
      <div style="
        max-width: 720px;
        width: 100%;
        text-align: center;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 28px 18px;
        background: #fff;
        box-shadow: 0 8px 24px rgba(0,0,0,.06);
      ">
        <div style="font-size: 54px; line-height: 1;">⛔</div>
        <div style="margin-top: 10px; font-size: 20px; font-weight: 700;">
          ${message}
        </div>
        <div style="margin-top: 6px; color: #6b7280; font-size: 14px;">
          Veuillez contacter l’administrateur si vous pensez qu’il s’agit d’une erreur.
        </div>
      </div>
    </div>
  `;
}
