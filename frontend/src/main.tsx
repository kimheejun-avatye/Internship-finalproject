import { StrictMode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import AppProviders from "./app/providers";
import "./styles/index.css";

const router = createBrowserRouter([{ path: "*", element: <AppProviders><App /></AppProviders> }]);

createRoot(document.getElementById("root")!).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>,
);
