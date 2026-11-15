import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

import "@/index.css";
import "./landing.css";
import { landingI18n, localeReady } from "./i18n";
import { LandingApp } from "./LandingApp";

const root = createRoot(document.getElementById("root")!);

function render() {
  root.render(
    <StrictMode>
      <I18nextProvider i18n={landingI18n}>
        <LandingApp />
      </I18nextProvider>
    </StrictMode>,
  );
}

if (localeReady === null) render();
else void localeReady.then(render);
