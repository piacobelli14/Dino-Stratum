import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

import { useEffect, useState } from "react";
import "./styles/App.css";

import Landing from "./pages/Landing.jsx";
import Login from "./pages/Authnetication/AuthLogin.jsx";
import Register from "./pages/Authnetication/AuthRegister.jsx";
import Reset from "./pages/Authnetication/AuthReset.jsx";
import Account from "./pages/Account/Account.jsx";
import Team from "./pages/Account/Team.jsx";
import RiskCommandCenter from "./pages/Stratum/RiskCommandCenter/RiskCommandCenter.jsx";

function App() {
  const [osClass, setOsClass] = useState("");

  useEffect(() => {
    const detectOS = () => {
      const userAgent = navigator.userAgent;
      if (userAgent.indexOf("Win") !== -1) {
        return "windows";
      } else if (userAgent.indexOf("Mac") !== -1) {
        return "mac";
      }
      return "";
    };

    const os = detectOS();
    setOsClass(os);
  }, []);

  return (
    <Router>
      <div className={`App ${osClass}`}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset" element={<Reset />} />

          <Route path="/account" element={
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          } />

          <Route path="/team" element={
            <ProtectedRoute>
              <Team />
            </ProtectedRoute>
          } />

          <Route path="/risk-command-center" element={
            <ProtectedRoute>
              <RiskCommandCenter />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;