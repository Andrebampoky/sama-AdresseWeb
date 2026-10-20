import { lazy, Suspense } from 'react'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import './styles/components.css'
import './styles/public.css'
import './styles/app.css'
import './styles/admin.css'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AdaptiveLayout } from './components/layout/AdaptiveLayout'
import { AdminLayout } from './components/layout/AdminLayout'
import { AppLayout } from './components/layout/AppLayout'
import { PublicLayout } from './components/layout/PublicLayout'
import { AccountPage } from './pages/AccountPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MyAddressesPage } from './pages/MyAddressesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RegisterPage } from './pages/RegisterPage'
import { SearchPage } from './pages/SearchPage'

// Pages avec carte Leaflet ou QR code : chargées à la demande pour alléger l'accueil.
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
const AdminModerationPage = lazy(() => import('./pages/admin/AdminModerationPage').then((m) => ({ default: m.AdminModerationPage })))
const AdminReportsPage = lazy(() => import('./pages/admin/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })))
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminAddressesPage = lazy(() => import('./pages/admin/AdminAddressesPage').then((m) => ({ default: m.AdminAddressesPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })))
const MyAddressDetailPage = lazy(() => import('./pages/MyAddressDetailPage').then((m) => ({ default: m.MyAddressDetailPage })))
const NewAddressPage = lazy(() => import('./pages/NewAddressPage').then((m) => ({ default: m.NewAddressPage })))
const PublicAddressPage = lazy(() => import('./pages/PublicAddressPage').then((m) => ({ default: m.PublicAddressPage })))
const SharePage = lazy(() => import('./pages/SharePage').then((m) => ({ default: m.SharePage })))

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<p className="loading page-fallback" role="status">Chargement…</p>}>
          <Routes>
          {/* Site public */}
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="connexion" element={<LoginPage />} />
            <Route path="inscription" element={<RegisterPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Pages publiques affichées dans l'espace personnel quand on est connecté */}
          <Route element={<AdaptiveLayout />}>
            <Route path="recherche" element={<SearchPage />} />
            <Route path="carte" element={<MapPage />} />
            <Route path="a/:code" element={<PublicAddressPage />} />
            <Route path="a/:code/partage" element={<SharePage />} />
          </Route>

          {/* Espace personnel (la protection réelle est faite par l'API) */}
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route path="tableau-de-bord" element={<DashboardPage />} />
            <Route path="mes-adresses" element={<MyAddressesPage />} />
            <Route path="mes-adresses/nouvelle" element={<NewAddressPage />} />
            <Route path="mes-adresses/:id" element={<MyAddressDetailPage />} />
            <Route path="compte" element={<AccountPage />} />
          </Route>

          {/* Administration (rôle ADMIN vérifié par l'API) */}
          <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
            <Route path="admin" element={<Outlet />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="moderation" element={<AdminModerationPage />} />
              <Route path="adresses" element={<AdminAddressesPage />} />
              <Route path="signalements" element={<AdminReportsPage />} />
              <Route path="utilisateurs" element={<AdminUsersPage />} />
            </Route>
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
