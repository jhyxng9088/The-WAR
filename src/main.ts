import "./styles.css";
import { bootstrap } from "./core/bootstrap";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("THE WAR root element was not found.");

void bootstrap(root);
