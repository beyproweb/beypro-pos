import React, { createContext, useContext, useState } from "react";

const HeaderContext = createContext({
  title: "",
  subtitle: "",
  centerNav: null,
  tableNav: null,
  actions: null,
  tableStats: null,
  setHeader: () => {},
});

export function HeaderProvider({ children }) {
  const [header, setHeader] = useState({});
  return (
    <HeaderContext.Provider value={{ ...header, setHeader }}>
      {children}
    </HeaderContext.Provider>

  );
}

export function useHeader() {
  return useContext(HeaderContext);
}
