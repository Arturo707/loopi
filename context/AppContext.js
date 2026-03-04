import React, { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [balance] = useState(3240);
  const [investedAmount, setInvestedAmount] = useState(0);
  const [portfolio, setPortfolio] = useState([]);

  const addToPortfolio = (stock) => {
    setPortfolio((prev) => [...prev, { ...stock, amount: stock.recommended }]);
    setInvestedAmount((prev) => prev + stock.recommended);
  };

  return (
    <AppContext.Provider value={{ balance, investedAmount, portfolio, addToPortfolio }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
