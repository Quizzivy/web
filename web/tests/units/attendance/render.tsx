import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import AttendancePage from "@/features/attendance/pages/teacher/AttendancePage";
import ClassDetailPage from "@/features/classes/pages/teacher/ClassDetailPage";
import { CLASS_ID } from "./support";

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** renderClass opens Class detail at `search`, with the pages a register links to. */
export function renderClass(search = "?tab=attendance") {
  const router = createMemoryRouter(
    [
      { path: "/teacher/classes/:id", element: <ClassDetailPage /> },
      { path: "/teacher/classes", element: <p>các lớp</p> },
      { path: "/teacher/calendar", element: <p>lịch</p> },
      { path: "/teacher/attendance", element: <p>trang điểm danh</p> },
    ],
    { initialEntries: [`/teacher/classes/${CLASS_ID}${search}`] },
  );
  render(
    <QueryClientProvider client={client()}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), router };
}

/** renderAttendance opens the Attendance page, with the class a row opens. */
export function renderAttendance() {
  const router = createMemoryRouter(
    [
      { path: "/teacher/attendance", element: <AttendancePage /> },
      { path: "/teacher/classes/:id", element: <p>lớp</p> },
    ],
    { initialEntries: ["/teacher/attendance"] },
  );
  render(
    <QueryClientProvider client={client()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), router };
}
