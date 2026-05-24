import "./App.css";

import Toolbar
  from "./components/layout/Toolbar";

import PdfViewer
  from "./components/viewers/PdfViewer";

export default function App() {

  return (

    <div className="app">

      <Toolbar />

      <div className="viewer-area">

        <PdfViewer />

      </div>

    </div>

  );
}