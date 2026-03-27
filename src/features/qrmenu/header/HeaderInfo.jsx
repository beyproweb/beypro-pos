import React from "react";

function HeaderInfo({
  restaurantName,
  mainTitleLogo,
  tagline,
  t,
}) {
  const logoSrc = String(mainTitleLogo || "").trim();

  return (
    <div className="max-w-4xl mx-auto px-4 pt-[30px]">
      <div className="text-center">
        {logoSrc ? (
          <>
            <div className="mx-auto w-full max-w-[320px] sm:max-w-[440px] md:max-w-[560px]">
              <img
                src={logoSrc}
                alt={restaurantName || t("Restaurant")}
                className="mx-auto h-auto w-full max-h-[84px] sm:max-h-[100px] md:max-h-[116px] object-contain"
                loading="lazy"
              />
            </div>
            <h1 className="sr-only">{restaurantName}</h1>
          </>
        ) : (
          <h1 className="text-[2rem] sm:text-[2.55rem] md:text-[3rem] font-serif font-semibold leading-[1.05] tracking-[-0.03em] text-gray-900 dark:text-neutral-50">
            {restaurantName}
          </h1>
        )}
        <p className="mt-2 text-[15px] sm:text-[16px] font-light tracking-[0.02em] text-gray-600 dark:text-neutral-300/85">
          {tagline}
        </p>
      </div>
    </div>
  );
}

export default React.memo(HeaderInfo);
