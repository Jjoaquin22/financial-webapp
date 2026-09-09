import { Route, Routes, Navigate } from "react-router-dom"
import Login from "./pages/Login"
import Signup from "./pages/Signup"


function App() {
 

  return (
    <>
    <Routes>
      <Route path="/" element={<Navigate to="/Signup" replace />} />
      <Route path="/Login" element={<Login />} />
      <Route path="/Signup" element={<Signup />} />
    </Routes>
    </>
  )
}

export default App
