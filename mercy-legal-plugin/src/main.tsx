import React from "react";
import ReactDOM from "react-dom/client";
import { FluentProvider } from "@fluentui/react-components";
import { App } from "./App";
import { mercyTheme } from "./styles/theme";
import "./styles/global.css";

const render = () => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <FluentProvider theme={mercyTheme}>
        <App />
      </FluentProvider>
    </React.StrictMode>
  );
};

if (typeof Office !== "undefined") {
  Office.onReady(() => render());
} else {
  render();
}
