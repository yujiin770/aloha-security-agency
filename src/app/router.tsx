import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { PublicLayout } from '@/layouts/PublicLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { PageGuard, ProtectedRoute } from './guards'

/**
 * Route table.
 *
 * Every page is lazily imported so the public site — which is what most
 * visitors load — never downloads the admin bundle. `<Suspense>` lives in the
 * layouts, so each group falls back to its own skeleton.
 */

const HomePage = lazy(() => import('@/pages/public/HomePage'))
const ServicesPage = lazy(() => import('@/pages/public/ServicesPage'))
const CareersPage = lazy(() => import('@/pages/public/CareersPage'))
const AboutPage = lazy(() => import('@/pages/public/AboutPage'))
const ContactPage = lazy(() => import('@/pages/public/ContactPage'))
const ApplyPage = lazy(() => import('@/pages/public/ApplyPage'))
const StatusPage = lazy(() => import('@/pages/public/StatusPage'))
const NewsListPage = lazy(() => import('@/pages/public/NewsListPage'))
const NewsPostPage = lazy(() => import('@/pages/public/NewsPostPage'))

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))
const AuthCallbackPage = lazy(() => import('@/pages/auth/AuthCallbackPage'))

const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'))
const ApplicantsPage = lazy(() => import('@/pages/admin/ApplicantsPage'))
const ApplicantDetailPage = lazy(() => import('@/pages/admin/ApplicantDetailPage'))
const PersonnelPage = lazy(() => import('@/pages/admin/PersonnelPage'))
const PersonnelDetailPage = lazy(() => import('@/pages/admin/PersonnelDetailPage'))
const BranchesPage = lazy(() => import('@/pages/admin/BranchesPage'))
const DeploymentsPage = lazy(() => import('@/pages/admin/DeploymentsPage'))
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'))
const UserDetailPage = lazy(() => import('@/pages/admin/UserDetailPage'))
const AuditPage = lazy(() => import('@/pages/admin/AuditPage'))
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'))
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'))
const ProfilePage = lazy(() => import('@/pages/admin/ProfilePage'))
const ConfigurationPage = lazy(() => import('@/pages/admin/ConfigurationPage'))
const PositionsPage = lazy(() => import('@/pages/admin/PositionsPage'))
const RanksPage = lazy(() => import('@/pages/admin/RanksPage'))
const RolesPage = lazy(() => import('@/pages/admin/RolesPage'))

const ContentPage = lazy(() => import('@/pages/admin/content/ContentPage'))
const CmsTestimonialsPage = lazy(
  () => import('@/pages/admin/content/TestimonialsPage'),
)
const CmsClientsPage = lazy(() => import('@/pages/admin/content/ClientsPage'))
const CmsAccreditationsPage = lazy(
  () => import('@/pages/admin/content/AccreditationsPage'),
)
const CmsNewsPage = lazy(() => import('@/pages/admin/content/NewsPage'))
const CmsMediaPage = lazy(() => import('@/pages/admin/content/MediaPage'))

const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'careers', element: <CareersPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'apply', element: <ApplyPage /> },
      { path: 'status', element: <StatusPage /> },
      { path: 'news', element: <NewsListPage /> },
      { path: 'news/:slug', element: <NewsPostPage /> },
    ],
  },

  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'callback', element: <AuthCallbackPage /> },
    ],
  },

  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/admin',
        element: <DashboardLayout />,
        children: [
          // Every admin route is gated by the page permission its role grants.
          // The same keys drive the sidebar (src/components/Sidebar.tsx) and
          // the Roles screen; the list lives in src/utils/pages.ts. Detail
          // routes share their list page's permission — being able to open
          // Applicants but not an applicant would be a strange thing to offer.
          {
            index: true,
            element: (
              <PageGuard permission="pages.dashboard">
                <DashboardPage />
              </PageGuard>
            ),
          },
          {
            path: 'applicants',
            element: (
              <PageGuard permission="pages.applicants">
                <ApplicantsPage />
              </PageGuard>
            ),
          },
          {
            path: 'applicants/:id',
            element: (
              <PageGuard permission="pages.applicants">
                <ApplicantDetailPage />
              </PageGuard>
            ),
          },
          {
            path: 'personnel',
            element: (
              <PageGuard permission="pages.personnel">
                <PersonnelPage />
              </PageGuard>
            ),
          },
          {
            path: 'personnel/:id',
            element: (
              <PageGuard permission="pages.personnel">
                <PersonnelDetailPage />
              </PageGuard>
            ),
          },
          {
            path: 'facilities',
            element: (
              <PageGuard permission="pages.facilities">
                <BranchesPage />
              </PageGuard>
            ),
          },
          {
            path: 'deployments',
            element: (
              <PageGuard permission="pages.deployments">
                <DeploymentsPage />
              </PageGuard>
            ),
          },
          {
            path: 'reports',
            element: (
              <PageGuard permission="pages.reports">
                <ReportsPage />
              </PageGuard>
            ),
          },
          {
            path: 'audit',
            element: (
              <PageGuard permission="pages.audit">
                <AuditPage />
              </PageGuard>
            ),
          },
          {
            path: 'users',
            element: (
              <PageGuard permission="pages.users">
                <UsersPage />
              </PageGuard>
            ),
          },
          {
            path: 'users/:id',
            element: (
              <PageGuard permission="pages.users">
                <UserDetailPage />
              </PageGuard>
            ),
          },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'settings/profile', element: <ProfilePage /> },
          // Data Configuration is a layout route: the hub owns the header and
          // section tabs, each section keeps its own URL. It previously had no
          // guard at all — the sidebar hid it from non-admins while the URL
          // stayed open. Writes are still governed by RLS, with <Can> hiding
          // the affordances.
          {
            path: 'config',
            element: (
              <PageGuard permission="pages.config">
                <ConfigurationPage />
              </PageGuard>
            ),
            children: [
              { index: true, element: <Navigate to="positions" replace /> },
              { path: 'positions', element: <PositionsPage /> },
              { path: 'ranks', element: <RanksPage /> },
              { path: 'roles', element: <RolesPage /> },
            ],
          },

          // Website content. Same layout-route shape as Data Configuration:
          // the hub owns the header and tabs, each section keeps its own URL.
          {
            path: 'content',
            element: (
              <PageGuard permission="pages.content">
                <ContentPage />
              </PageGuard>
            ),
            children: [
              { index: true, element: <Navigate to="testimonials" replace /> },
              { path: 'testimonials', element: <CmsTestimonialsPage /> },
              { path: 'clients', element: <CmsClientsPage /> },
              { path: 'accreditations', element: <CmsAccreditationsPage /> },
              { path: 'news', element: <CmsNewsPage /> },
              { path: 'media', element: <CmsMediaPage /> },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
])
