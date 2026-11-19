import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Provider } from './store'
import { Layout } from './components'
import Home from './pages/Home'
import Browse from './pages/Browse'
import News from './pages/News'
import Detail from './pages/Detail'
import Reader from './pages/Reader'
import Profile from './pages/Profile'
import Tools from './pages/Tools'
import Admin from './pages/Admin'

export default function App() {
  return (
    <BrowserRouter>
      <Provider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="browse" element={<Browse />} />
            <Route path="news" element={<News />} />
            <Route path="discover" element={<Tools />} />
            <Route path="title/:id" element={<Detail />} />
            <Route path="profile" element={<Profile />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<div className="empty">404</div>} />
          </Route>
          <Route path="read/:id/:ch" element={<Reader />} />
        </Routes>
      </Provider>
    </BrowserRouter>
  )
}
