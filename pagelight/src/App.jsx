import { Suspense, lazy } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Icon from './components/Icon'
import { Empty, Skeleton } from './components/ui'
import { AppProvider, useApp } from './lib/app'
import Home from './pages/Home'

const Browse = lazy(() => import('./pages/Browse'))
const Title = lazy(() => import('./pages/Title'))
const Reader = lazy(() => import('./pages/Reader'))
const News = lazy(() => import('./pages/News'))
const Auth = lazy(() => import('./pages/Auth'))
const Profile = lazy(() => import('./pages/Profile'))
const Admin = lazy(() => import('./pages/Admin'))
const D = (name) => lazy(() => import('./pages/Discover').then((m) => ({ default: m[name] })))
const DiscoverHub = D('DiscoverHub'), Wheel = D('Wheel'), Compare = D('Compare'), Gems = D('Gems'), Magazine = D('Magazine'), CalendarPage = D('CalendarPage'), QuoteStudio = D('QuoteStudio'), Matcher = D('Matcher'), Gift = D('Gift')

function Feature({ name, children }) {
  const { site, t } = useApp()
  if (site.features[name] === false) return <div className="page"><Empty icon="lock" title={t('feature.disabled')} action={<Link to="/" className="btn primary">{t('nav.home')}</Link>} /></div>
  return children
}
function NotFound() {
  const { t } = useApp()
  return <div className="page"><Empty icon="compass" title={t('notfound')} action={<Link to="/" className="btn primary"><Icon name="home" size={16} />{t('nav.home')}</Link>} /></div>
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="page"><Skeleton h={300} r={20} /></div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="browse" element={<Browse />} />
              <Route path="title/:id" element={<Title />} />
              <Route path="read/:id/:ch" element={<Reader />} />
              <Route path="news" element={<Feature name="news"><News /></Feature>} />
              <Route path="calendar" element={<Feature name="calendar"><CalendarPage /></Feature>} />
              <Route path="auth" element={<Auth />} />
              <Route path="profile" element={<Profile />} />
              <Route path="discover" element={<DiscoverHub />} />
              <Route path="wheel" element={<Wheel />} />
              <Route path="compare" element={<Compare />} />
              <Route path="gems" element={<Gems />} />
              <Route path="magazine" element={<Magazine />} />
              <Route path="quotes" element={<Feature name="quotes"><QuoteStudio /></Feature>} />
              <Route path="matcher" element={<Matcher />} />
              <Route path="gift/:id" element={<Gift />} />
              <Route path="admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  )
}
