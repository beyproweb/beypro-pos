import React, { createContext, useContext, useState } from "react";

const HeaderContext = createContext({
  title: "",
  subtitle: "",
  tableNav: null,
  actions: null,
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
