import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Score from './pages/Score';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scores/:id" element={<Score />} />
      </Routes>
    </BrowserRouter>
  );
}
