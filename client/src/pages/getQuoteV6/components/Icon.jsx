export default function Icon({ name, size = 18, color = 'currentColor', stroke = 1.7 }) {
  const paths = {
    pin: <><path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" /><circle cx="12" cy="9" r="2.6" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    phone: <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
    check: <path d="m5 13 4 4L19 7" />,
    cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></>,
    box: <><path d="M3 8 12 4l9 4-9 4-9-4Z" /><path d="M3 8v8l9 4 9-4V8" /><path d="M12 12v8" /></>,
    bldg: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" /></>,
    house2: <><path d="m3 12 9-8 9 8v9H3z" /><path d="M10 21v-6h4v6" /></>,
    warehouse: <><path d="m2 9 10-5 10 5v12H2z" /><path d="M6 21v-7h12v7M6 14h12" /></>,
    chev: <path d="m9 6 6 6-6 6" />,
    chevL: <path d="m15 6-6 6 6 6" />,
    chevD: <path d="m6 9 6 6 6-6" />,
    sparkle: <><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /></>,
    shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.5 3.6-8 8-8s8 3.5 8 8" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.5" /></>,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    stairs: <path d="M3 21h5v-4h5v-4h5v-4h3" />,
    elevator: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="m9 10 3-3 3 3M9 14l3 3 3-3" /></>,
    piano: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M8 5v9M12 5v9M16 5v9M3 14h18" /></>,
    couch: <><path d="M3 14a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4H3z" /><path d="M5 18v2M19 18v2M6 11V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" /></>,
    weight: <><path d="M6 8h12l-1 12H7zM10 8V6a2 2 0 0 1 4 0v2" /></>,
    truck: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
    map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></>,
    dots: <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
    star: <path d="m12 3 2.7 5.7 6.3.9-4.5 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.3-.9L12 3Z" fill="currentColor" stroke="none" />,
    doc: <><path d="M7 3h9l4 4v14H7z" /><path d="M16 3v5h4M10 12h7M10 16h7M10 8h3" /></>,
    users: <><circle cx="9" cy="9" r="3.5" /><path d="M3 20c0-3.6 2.7-6.5 6-6.5s6 2.9 6 6.5" /><circle cx="17" cy="11" r="2.8" /><path d="M14 20c0-2.4 1.8-4.5 4-4.5s3 1.7 3 3.5" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
    heart: <path d="M12 21s-7-4.5-9.5-9.5C0.5 7 3 3 7 4c2 .5 3.5 2 5 4 1.5-2 3-3.5 5-4 4-1 6.5 3 4.5 7.5C19 16.5 12 21 12 21Z" />,
    tag: <><path d="M21 13.6V5a2 2 0 0 0-2-2H10.4a2 2 0 0 0-1.4.6L3.6 8.6a2 2 0 0 0 0 2.8l8 8a2 2 0 0 0 2.8 0l5.4-5.4a2 2 0 0 0 .6-1.4Z" /><circle cx="14" cy="10" r="1.5" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
