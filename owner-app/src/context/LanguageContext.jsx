import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import translations from '../language.json';

export const LanguageContext = createContext({
  lang: 'en',
  t: translations.en,
  toggleLanguage: () => {},
  setLanguage: () => {},
  isRtl: false,
});

const getInitialLang = () => {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('hl_lang');
      if (saved === 'en' || saved === 'ur') {
        return saved;
      }
    } catch (e) {
      // LocalStorage access may be restricted
    }
  }
  return 'en';
};

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang);

  const isRtl = lang === 'ur';

  // Synchronize document attributes and localStorage on language change
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
      document.documentElement.setAttribute('lang', lang);
      if (isRtl) {
        document.documentElement.classList.add('rtl');
      } else {
        document.documentElement.classList.remove('rtl');
      }
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('hl_lang', lang);
      } catch (e) {
        // LocalStorage write failed
      }
    }
  }, [lang, isRtl]);

  const toggleLanguage = useCallback(() => {
    setLang((prev) => (prev === 'en' ? 'ur' : 'en'));
  }, []);

  const setLanguage = useCallback((newLang) => {
    if (newLang === 'en' || newLang === 'ur') {
      setLang(newLang);
    }
  }, []);

  // Hybrid t helper: callable function and direct dictionary object
  const t = useMemo(() => {
    const dict = translations[lang] || translations.en;
    const translateFn = (key, params) => {
      let str = dict[key] || translations.en[key] || key;
      if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
      }
      return str;
    };
    return Object.assign(translateFn, dict);
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      t,
      toggleLanguage,
      setLanguage,
      isRtl,
    }),
    [lang, t, toggleLanguage, setLanguage, isRtl]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export default LanguageContext;
