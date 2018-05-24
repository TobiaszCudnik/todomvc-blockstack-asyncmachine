import React from "react";
import { render as react_render } from "react-dom";
import App from "./components/App";
import Manager from "./manager";
import "todomvc-app-css/index.css";
import { Provider } from "./context";

function render(manager) {
  react_render(
    <Provider value={manager}>
      <App />
    </Provider>,
    document.getElementById("root")
  );
}

const manager = new Manager();
manager.state.on("tick", () => render(manager));
render(manager);
