"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login(username, password);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "خطا در ورود");
      toast.success(`خوش آمدید ${data.admin?.full_name || username}`);
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در ورود");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl shadow-black/20">
        <div className="text-center mb-8 pt-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/15 text-primary text-2xl font-bold mb-4">
            N
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Nexoranode</h1>
          <p className="text-text-muted text-sm mt-2">پنل مدیریت نکسورانود</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">نام کاربری</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
          </div>
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">رمز عبور</label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="pl-10"
              />
              <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" onClick={() => setShow(!show)}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "در حال ورود..." : "ورود"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
