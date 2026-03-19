export type SessionUser = {
  id: number;
  username: string;
  isSuperuser: boolean;
  departmentId: number | null;
  firstName: string;
  lastName: string;
};
