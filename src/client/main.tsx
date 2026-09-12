import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ActivityConnection } from "./connection";
import "./styles.css";
const root = createRoot(document.getElementById("root")!);
if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("fixture")
) {
  const { fixture } = await import("./fixtures");
  root.render(
    <App {...fixture(new URLSearchParams(location.search).get("fixture")!)} />,
  );
} else root.render(<App connection={new ActivityConnection()} />);
