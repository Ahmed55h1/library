export default function Art({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 650 500"
      className={compact ? "art compact" : "art"}
      aria-hidden="true"
    >
      <defs>
        <filter id="shadow">
          <feDropShadow
            dx="3"
            dy="14"
            stdDeviation="12"
            floodColor="#374335"
            floodOpacity=".14"
          />
        </filter>
        <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M30 0H0V30" fill="none" stroke="#c0d0b9" strokeWidth=".6" />
        </pattern>
        <pattern
          id="lines"
          width="20"
          height="22"
          patternUnits="userSpaceOnUse"
        >
          <path d="M0 20H20" stroke="#c5d4d1" strokeWidth="1" />
        </pattern>
      </defs>
      <circle cx="330" cy="249" r="215" fill="#e0e6c5" />
      <circle cx="330" cy="249" r="195" fill="url(#grid)" />
      <g
        transform="translate(93 124) rotate(-15 105 150)"
        filter="url(#shadow)"
      >
        <rect width="205" height="283" rx="11" fill="#173f36" />
        <rect x="10" y="3" width="191" height="271" rx="8" fill="#285c4c" />
        <path d="M15 4V275" stroke="#123b31" strokeWidth="4" />
        <rect x="35" y="52" width="138" height="80" rx="2" fill="#e9e8d5" />
        <text
          x="104"
          y="83"
          textAnchor="middle"
          fontFamily="Georgia"
          fontSize="16"
          fill="#245342"
        >
          A LITTLE BOOK
        </text>
        <text
          x="104"
          y="105"
          textAnchor="middle"
          fontFamily="Georgia"
          fontSize="11"
          fill="#245342"
          letterSpacing="2"
        >
          OF BIG IDEAS
        </text>
        <path
          d="M101 175q-30 15 0 50q30-35 0-50M101 180v40"
          fill="none"
          stroke="#c6d193"
          strokeWidth="1.5"
        />
        <path d="M196 15v245" stroke="#d5d8bc" strokeWidth="5" />
      </g>
      <g transform="translate(300 87) rotate(12 110 150)" filter="url(#shadow)">
        <rect width="210" height="280" rx="7" fill="#d9a177" />
        <rect x="6" y="-4" width="202" height="273" rx="5" fill="#f7f3de" />
        <rect x="25" y="30" width="163" height="212" fill="url(#lines)" />
        <path d="M45 15v239" stroke="#dba19c" strokeWidth="1" />
        <path d="M6 0v267" stroke="#dfd0af" strokeWidth="6" />
        <g fill="#c59b6d">
          {[22, 52, 82, 112, 142, 172, 202, 232].map((y) => (
            <g key={y}>
              <circle cx="8" cy={y} r="4" />
              <path
                d={`M9 ${y - 4}q-20-5-15 8`}
                fill="none"
                stroke="#8d7a58"
                strokeWidth="3"
              />
            </g>
          ))}
        </g>
        <path
          d="M77 80q15-20 37 0M80 93h68M80 108h58"
          fill="none"
          stroke="#6b8b76"
          strokeWidth="2.5"
        />
        <path
          d="m126 140 9 18 20 3-15 15 4 20-18-10-18 10 4-20-15-15 20-3Z"
          fill="none"
          stroke="#bd7c55"
          strokeWidth="2"
        />
      </g>
      <g transform="translate(485 220) rotate(22)" filter="url(#shadow)">
        <rect width="16" height="190" rx="2" fill="#edaf49" />
        <path d="M5 8v165M12 8v165" stroke="#d7932d" strokeWidth="2" />
        <path d="M0 175h16l-8 24Z" fill="#ddc39a" />
        <path d="m5 190 3 9 3-9Z" fill="#343e35" />
        <rect y="-12" width="16" height="24" rx="4" fill="#e2a69a" />
        <rect y="7" width="16" height="12" fill="#bdc8b5" />
      </g>
      <g transform="translate(241 335) rotate(12 90 40)" filter="url(#shadow)">
        <rect width="175" height="54" rx="3" fill="#eed8a6" />
        <path d="M10 9h155" stroke="#b6a47e" />
        {Array.from({ length: 16 }, (_, i) => (
          <path
            key={i}
            d={`M${13 + i * 10} 9v${i % 5 === 0 ? 20 : 11}`}
            stroke="#978c6e"
            strokeWidth="1"
          />
        ))}
        <text x="13" y="43" fontSize="9" fill="#a08a63" fontFamily="monospace">
          MADE TO MEASURE
        </text>
      </g>
      <g transform="translate(83 50) rotate(-15)">
        <path
          d="m0 0 9 18 20 3-15 14 4 20-18-10-18 10 4-20-15-14 20-3Z"
          fill="#e6a161"
        />
        <path d="M0 12v28M-13 26h26" stroke="#f8edda" strokeWidth="2" />
      </g>
      <path
        d="M552 116v35m-17-18h34M83 325v23m-11-11h23"
        stroke="#6e8962"
        strokeWidth="2"
      />
      <circle cx="550" cy="395" r="5" fill="#b88d59" />
      <circle cx="208" cy="70" r="4" fill="#7b9b65" />
      <path d="m337 442 12-4 5 12-12 4Z" fill="#d4a475" />
    </svg>
  );
}
