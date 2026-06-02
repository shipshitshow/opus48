import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Note: intentionally NOT using React.StrictMode. The 3D viewer creates a
// single WebGL context / canvas in a mount effect; StrictMode's double-invoke
// in dev would create and tear down two contexts, which is wasteful and can
// flash a blank frame. Effects below still clean up correctly regardless.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
