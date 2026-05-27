export function getMockBusyBlocks(anchor = new Date()) {
  const start = startOfWeek(anchor);
  const day = (offset, hour, minute = 0) => {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    date.setHours(hour, minute, 0, 0);
    return date;
  };

  return [
    {
      id: "busy-mon-lecture",
      title: "Calculus lecture",
      start: day(0, 10).toISOString(),
      end: day(0, 11, 30).toISOString(),
      source: "mock"
    },
    {
      id: "busy-tue-lab",
      title: "Chemistry lab",
      start: day(1, 14).toISOString(),
      end: day(1, 16).toISOString(),
      source: "mock"
    },
    {
      id: "busy-wed-work",
      title: "Part-time shift",
      start: day(2, 18).toISOString(),
      end: day(2, 21).toISOString(),
      source: "mock"
    },
    {
      id: "busy-thu-seminar",
      title: "History seminar",
      start: day(3, 9, 30).toISOString(),
      end: day(3, 11).toISOString(),
      source: "mock"
    },
    {
      id: "busy-fri-group",
      title: "Project group meeting",
      start: day(4, 15).toISOString(),
      end: day(4, 16).toISOString(),
      source: "mock"
    }
  ];
}

export function startOfWeek(anchor = new Date()) {
  const date = new Date(anchor);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
