import { render } from "solid-js/web";
import { afterEach, expect, test } from "vitest";
import App from "./App";

afterEach(() => {
  document.body.innerHTML = "";
});

test("renders the app name as the heading", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const dispose = render(() => <App />, container);

  expect(container.querySelector("h1")?.textContent).toBe("ompline");

  dispose();
});
