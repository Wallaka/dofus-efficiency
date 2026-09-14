import { NavLink, Route, Routes } from "react-router-dom";
import { CraftPage } from "./pages/CraftPage";
import { CraftListPage } from "./pages/CraftListPage";
import { MetierPage } from "./pages/MetierPage";
import { EleveurPage } from "./pages/EleveurPage";
import { AvisPage } from "./pages/AvisPage";
import { QuestsPage } from "./pages/QuestsPage";
import { PricesPage } from "./pages/PricesPage";
import { TrackedItemsPage } from "./pages/TrackedItemsPage";
import { MesRessourcesPage } from "./pages/MesRessourcesPage";
import { DonneesPage } from "./pages/DonneesPage";

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Dofus Efficiency</h1>
        <nav className="app-nav">
          <NavLink to="/" end>
            Craft & kamas
          </NavLink>
          <NavLink to="/craft">Craft</NavLink>
          <NavLink to="/metiers">Métiers</NavLink>
          <NavLink to="/eleveur">Éleveur</NavLink>
          <NavLink to="/avis">Avis de recherche</NavLink>
          <NavLink to="/quetes">Quêtes</NavLink>
          <NavLink to="/suivis">Objets suivis</NavLink>
          <NavLink to="/ressources">Mes ressources</NavLink>
          <NavLink to="/prix">Prix</NavLink>
          <NavLink to="/donnees">Données</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<CraftPage />} />
        <Route path="/craft" element={<CraftListPage />} />
        <Route path="/metiers" element={<MetierPage />} />
        <Route path="/eleveur" element={<EleveurPage />} />
        <Route path="/avis" element={<AvisPage />} />
        <Route path="/quetes" element={<QuestsPage />} />
        <Route path="/suivis" element={<TrackedItemsPage />} />
        <Route path="/ressources" element={<MesRessourcesPage />} />
        <Route path="/prix" element={<PricesPage />} />
        <Route path="/donnees" element={<DonneesPage />} />
      </Routes>

      <footer className="app-footer">
        <p>
          Données d'objets/recettes : exemples intégrés ou API DofusDB. Les prix
          viennent des captures Medal (OCR).
        </p>
      </footer>
    </div>
  );
}
