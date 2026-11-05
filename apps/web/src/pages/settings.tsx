import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  Save,
  Users2,
  Plus,
  Trash2,
  ShieldCheck,
  Pencil,
  Settings2,
  CalendarClock,
  UserCog as UserCog2,
  ArrowDownUp,
  Database,
  Tag,
  Flag,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatBytes, relativeTime, flagEmoji } from "@/lib/utils";
import type { AdminInfo, Permission } from "@/lib/types";

const PERMISSION_KEYS: Record<Permission, "dashboard" | "users" | "inbounds" | "routing" | "activityLog" | "telegramBot" | "settings"> = {
  dashboard: "dashboard",
  users: "users",
  inbounds: "inbounds",
  routing: "routing",
  activity: "activityLog",
  bot: "telegramBot",
  settings: "settings",
};
const ASSIGNABLE_PERMS: Permission[] = ["dashboard", "users", "inbounds", "routing", "activity", "bot"];

function CredentialsCard() {
  const toast = useToast();
  const { t } = useI18n();
  const { username, refresh } = useAuth();
  const [newUsername, setNewUsername] = React.useState(username || "");
  const [newPassword, setNewPassword] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");

  const credMut = useMutation({
    mutationFn: () =>
      api.changeCredentials({
        currentPassword,
        newUsername: newUsername || undefined,
        newPassword: newPassword || undefined,
      }),
    onSuccess: async () => {
      toast.push("success", t("credentialsUpdated"));
      setCurrentPassword("");
      setNewPassword("");
      await refresh();
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUsername.trim().length < 3) {
      toast.push("error", t("usernameMin"));
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast.push("error", t("passwordMin"));
      return;
    }
    if (!currentPassword) {
      toast.push("error", t("enterCurrent"));
      return;
    }
    credMut.mutate();
  };

  return (
    <Card className="card-lift flex h-full flex-col overflow-hidden">
      <div className="h-1.5 w-full shrink-0 bg-[#a3e635]" />
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-main" />
          <CardTitle>{t("changeCredentials")}</CardTitle>
        </div>
        <CardDescription>{t("changeCredentialsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <form onSubmit={submit} className="flex h-full flex-col space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="newUsername">{t("username")}</Label>
            <Input
              id="newUsername"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("leaveBlank")}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" disabled={credMut.isPending} className="mt-auto w-full sm:w-auto">
            <Save className="h-4 w-4" />
            {credMut.isPending ? t("saving") : t("saveChanges")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AdminDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: AdminInfo | null;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [permissions, setPermissions] = React.useState<Permission[]>(["users"]);
  const [dataLimit, setDataLimit] = React.useState(0);
  const [expireDays, setExpireDays] = React.useState(0);
  const [comment, setComment] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setUsername(editing.username);
      setPassword("");
      setPermissions(editing.permissions);
      setDataLimit(Math.round((editing.dataLimit / 1024 ** 3) * 100) / 100);
      setExpireDays(
        editing.expireAt
          ? Math.max(0, Math.ceil((editing.expireAt - Date.now()) / 86_400_000))
          : 0,
      );
      setComment(editing.comment ?? "");
    } else {
      setUsername("");
      setPassword("");
      setPermissions(["users"]);
      setDataLimit(0);
      setExpireDays(0);
      setComment("");
    }
  }, [open, editing]);

  const createMut = useMutation({
    mutationFn: () =>
      api.createAdmin({ username, password, permissions, dataLimit, expireDays, comment }),
    onSuccess: () => {
      toast.push("success", t("adminCreated"));
      qc.invalidateQueries({ queryKey: ["admins"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.push("error", e.message),
  });



  const updateMut = useMutation({
    mutationFn: () =>
      api.updateAdmin(editing!.id, {
        permissions,
        dataLimit,
        expireDays,
        comment,
        password: password || undefined,
      }),
    onSuccess: () => {
      toast.push("success", t("adminUpdated"));
      qc.invalidateQueries({ queryKey: ["admins"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const toggle = (p: Permission) =>
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && username.trim().length < 3) {
      toast.push("error", t("usernameMin"));
      return;
    }
    if (!editing && password.length < 6) {
      toast.push("error", t("passwordMin"));
      return;
    }
    if (editing && password && password.length < 6) {
      toast.push("error", t("passwordMin"));
      return;
    }
    if (permissions.length === 0) {
      toast.push("error", t("selectPage"));
      return;
    }
    if (editing) updateMut.mutate();
    else createMut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `${t("edit")} ${editing.username}` : t("addAdmin")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="adminUsername">Username</Label>
              <Input
                id="adminUsername"
                value={username}
                onChange={(e) => setUsername(e.target.value.slice(0, 24))}
                maxLength={24}
                autoFocus
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="adminPassword">{editing ? t("passwordOptional") : t("password")}</Label>
            <Input
              id="adminPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={editing ? "Leave blank to keep current" : "At least 6 characters"}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("pageAccess")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {ASSIGNABLE_PERMS.map((p) => {
                const active = permissions.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggle(p)}
                    className={cn(
                      "item-lift rounded-base border-2 border-border px-3 py-2 text-left text-sm font-heading",
                      active ? "bg-main text-mtext neo-shadow" : "bg-bw hover:bg-main/10",
                    )}
                  >
                    {t(PERMISSION_KEYS[p])}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-text/50">
              {t("adminNoSettings")}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("dataQuota")}</Label>
              <NumberInput value={dataLimit} onChange={setDataLimit} step={1} suffix="GB" />
              <p className="text-[11px] text-text/50">{t("unlimitedHint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("adminExpiry")}</Label>
              <NumberInput value={expireDays} onChange={setExpireDays} step={1} suffix={t("days")} />
              <p className="text-[11px] text-text/50">
                {expireDays > 0 ? t("expiryHint") : t("neverExpires")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminComment">{t("comment")}</Label>
            <Input
              id="adminComment"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 200))}
              maxLength={200}
              placeholder={t("adminCommentHint")}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="neutral" onClick={() => onOpenChange(false)}>{t("cancel")}
            </Button>
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
              {editing ? t("save") : t("addAdmin")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminsCard() {
  const toast = useToast();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AdminInfo | null>(null);

  const { data } = useQuery({ queryKey: ["admins"], queryFn: api.admins });
  const admins = (data?.admins ?? []).filter((a) => a.role !== "owner");

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteAdmin(id),
    onSuccess: () => {
      toast.push("success", t("adminRemoved"));
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  return (
    <Card className="card-lift flex h-full min-w-0 flex-col overflow-hidden">
      <div className="h-1.5 w-full shrink-0 bg-[#fbbf24]" />
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users2 className="h-5 w-5 text-main" />
              <CardTitle>{t("admins")}</CardTitle>
            </div>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />{t("addAdmin")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
        {admins.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-2 rounded-base border-2 border-dashed border-border/40 py-10 text-center text-sm text-text/50">
            <Users2 className="h-8 w-8" />
            <p>{t("noAdmins")}</p>
          </div>
        )}
        {admins.map((a) => {
          const expired = !!a.expireAt && a.expireAt < Date.now();
          return (
            <div
              key={a.id}
              className="item-lift flex min-w-0 flex-col overflow-hidden rounded-base border-2 border-border bg-bg/40"
            >
              {expired && <div className="h-1 w-full shrink-0 bg-red-400" />}
              <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={cn(
                        "grid h-12 w-12 shrink-0 place-items-center rounded-base border-2 border-border",
                        expired ? "bg-bw text-text/60" : "bg-main text-mtext",
                      )}
                    >
                      <UserCog2 className="h-6 w-6" />
                    </div>
                    <span className="min-w-0 flex-1 truncate font-heading text-base" title={a.username}>
                      {a.username}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="neutral"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => {
                        setEditing(a);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="danger"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setDeleteTarget(a)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {(a.comment || expired) && (
                  <div className="min-w-0 space-y-2">
                    {a.comment && (
                      <div className="item-lift flex items-center gap-2 rounded-base border-2 border-border bg-bg/40 px-2.5 py-2">
                        <Tag className="h-3.5 w-3.5 shrink-0 text-text/50" />
                        <span className="min-w-0 flex-1 truncate font-heading text-sm" title={a.comment}>
                          {a.comment}
                        </span>
                      </div>
                    )}
                    {expired && (
                      <Badge variant="danger" className="gap-1 text-[10px]">
                        <ShieldCheck className="h-3 w-3" /> {t("expired")}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="mt-auto space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="item-lift min-w-0 rounded-base border-2 border-border bg-lime-300/15 p-2">
                      <div className="flex items-center gap-1 text-lime-600 dark:text-lime-400">
                        <Users2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate font-heading text-base">{a.userCount ?? 0}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-text/50">{t("users")}</div>
                    </div>
                    <div className="item-lift min-w-0 rounded-base border-2 border-border bg-sky-300/15 p-2">
                      <div className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                        <ArrowDownUp className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate font-heading text-sm">{formatBytes(a.used ?? 0)}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-text/50">{t("used")}</div>
                    </div>
                    <div className="item-lift min-w-0 rounded-base border-2 border-border bg-amber-300/15 p-2">
                      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Database className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate font-heading text-sm">
                          {a.dataLimit > 0 ? formatBytes(a.dataLimit) : "∞"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-text/50">{t("quota")}</div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "item-lift flex items-center justify-center gap-2 rounded-base border-2 border-border py-2.5 text-center",
                      expired ? "bg-red-400/15" : "bg-lime-300/15",
                    )}
                  >
                    <CalendarClock
                      className={cn("h-4 w-4 shrink-0", expired ? "text-red-500" : "text-lime-500")}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-heading text-sm">
                        {!a.expireAt ? t("neverExpires") : expired ? t("expired") : relativeTime(a.expireAt)}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-text/50">
                        {t("adminExpiry")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>

      <AdminDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("removeAdmin")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-base text-text/70">
            {t("removeAdminConfirm")} <span className="font-heading text-text">{deleteTarget?.username}</span>?
          </p>
          <DialogFooter>
            <Button variant="neutral" onClick={() => setDeleteTarget(null)}>{t("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              <Trash2 className="h-4 w-4" />{t("remove")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function LocationCard() {
  const toast = useToast();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [location, setLocation] = React.useState("");

  React.useEffect(() => {
    if (data) setLocation(data.location || "");
  }, [data]);

  const mut = useMutation({
    mutationFn: () => api.updateSettings({ location: location.trim().toUpperCase() }),
    onSuccess: () => {
      toast.push("success", t("saved"));
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z]{2}$/.test(location.trim())) {
      toast.push("error", t("invalidCountry"));
      return;
    }
    mut.mutate();
  };

  const flag = flagEmoji(location);

  return (
    <Card className="card-lift flex h-full flex-col overflow-hidden">
      <div className="h-1.5 w-full shrink-0 bg-[#7dd3fc]" />
      <CardHeader>
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-main" />
          <CardTitle>{t("locationDefault")}</CardTitle>
        </div>
        <CardDescription>{t("locationDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <form onSubmit={submit} className="space-y-3">
          <div className="item-lift flex items-center gap-3 rounded-base border-2 border-border bg-bg/40 p-3">
            <span className="grid h-10 w-12 shrink-0 place-items-center rounded-base border-2 border-border bg-bw text-xl leading-none">
              {flag || "—"}
            </span>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value.slice(0, 2).toUpperCase())}
              placeholder="NL"
              maxLength={2}
              spellCheck={false}
              className="font-mono uppercase"
            />
          </div>
          <div className="rounded-base border-2 border-dashed border-border bg-bg/25 px-3 py-2.5 text-center font-heading text-sm text-text/70">
            SideRail {flag || "‹flag›"} - Default
          </div>
          <Button type="submit" disabled={mut.isPending} className="gap-1.5">
            <Save className="h-4 w-4" />
            {mut.isPending ? t("saving") : t("saveChanges")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { isOwner } = useAuth();
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings2}
        accent="#fbbf24"
        title={t("settings")}
        description={t("manageAccount")}
      />

      {isOwner ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-5 lg:items-stretch">
            <div className="lg:col-span-2">
              <CredentialsCard />
            </div>
            <div className="lg:col-span-3">
              <AdminsCard />
            </div>
          </div>
          <LocationCard />
        </div>
      ) : (
        <CredentialsCard />
      )}
    </div>
  );
}
