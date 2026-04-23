import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import RequireAuth from './features/auth/RequireAuth';
import RequireAdmin from './features/auth/RequireAdmin';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AdminPage from './pages/AdminPage';
import CharactersPage from './pages/CharactersPage';
import CharacterWizard from './features/character/CharacterWizard';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/characters"
            element={
              <RequireAuth>
                <CharactersPage />
              </RequireAuth>
            }
          />
          <Route
            path="/characters/new"
            element={
              <RequireAuth>
                <CharacterWizard />
              </RequireAuth>
            }
          />
          <Route
            path="/characters/:id/edit"
            element={
              <RequireAuth>
                <CharacterWizard />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
