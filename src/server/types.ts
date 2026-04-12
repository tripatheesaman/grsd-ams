export type SessionUser = {
  id: number;
  username: string;
  isSuperuser: boolean;
  isDepartmentAdmin: boolean;
  departmentId: number | null;
  firstName: string;
  lastName: string;
};
