import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { useEffect, useState } from "react";
import "./styles/App.css";

import useIsTouchDevice from "./TouchDevice.jsx";
import StratumMobile from "./helpers/Mobile.jsx";

import Login from "./pages/Authnetication/AuthLogin.jsx";
import Register from "./pages/Authnetication/AuthRegister.jsx";
import Reset from "./pages/Authnetication/AuthReset.jsx";
import Account from "./pages/Account/Account.jsx";
import RiskCommandCenter from "./pages/DinoStratumIntelligence/RiskCommandCenter.jsx";
import AssetManagement from "./pages/DinoStratumManagement/AssetManagement.jsx";

function App() {
  const [osClass, setOsClass] = useState("");
  const isTouchDevice = useIsTouchDevice();

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
        {!isTouchDevice ? (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset" element={<Reset />} />

            <Route path="/account" element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            } />

            <Route path="/risk-command-center" element={
              <ProtectedRoute>
                <RiskCommandCenter />
              </ProtectedRoute>
            } />

            <Route path="/asset-management" element={
              <ProtectedRoute>
                <AssetManagement />
              </ProtectedRoute>
            } />

            <Route index element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="*" element={<StratumMobile />} />
          </Routes>
        )}
      </div>
    </Router>
  );
}

export default App;