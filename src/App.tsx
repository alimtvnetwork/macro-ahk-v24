import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Popup from "./pages/Popup";
import Options from "./pages/Options";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary section="App Root">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/options" element={<Options />} />
            <Route path="/popup" element={<Popup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
