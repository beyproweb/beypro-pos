import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";

export default function SectionState({
  loading,
  error,
  loadingMessage,
  errorMessage,
  onRetry,
  children,
  className = "",
}) {
  const { t } = useTranslation();

  const resolvedLoadingMessage =
    loadingMessage !== undefined ? loadingMessage : t("Loading data…");

  if (loading) {
    if (resolvedLoadingMessage === null) {
      return <div className={`p-6 ${className}`} />;
    }

    return (
      <div className={`p-6 text-center text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        {resolvedLoadingMessage}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 text-center text-sm space-y-3 text-red-500 dark:text-red-400 ${className}`}>
        <div>{errorMessage || t("Something went wrong while loading this section.")}</div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("Try Again")}
          </Button>
        )}
      </div>
    );
  }

  return children;
}
