import { Route, Routes, Navigate } from "react-router-dom"
import Login from "./pages/Login"
import Signup from "./pages/Signup"
import Transaction from "./pages/Transaction"


function App() {
 

  return (
    <>
    <Routes>
      <Route path="/" element={<Navigate to="/Login" replace />} />
      <Route path="/Login" element={<Login />} />
      <Route path="/Signup" element={<Signup />} />
      <Route path="/Transaction" element={<Transaction />} />
    </Routes>
    </>
  )
}

export default App
