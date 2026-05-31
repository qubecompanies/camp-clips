import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Code-split the two routes so a landing visitor doesn't download the editor's
// bundle (Zustand store, export/playback/audio libs) and vice versa.
const Landing = lazy(() => import('./pages/Landing'));
const Editor = lazy(() => import('./pages/Editor'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Editor />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
