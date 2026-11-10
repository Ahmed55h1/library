import { randomUUID } from "node:crypto";

export async function hiddenPassword() {
  if (process.env.MAKTABATI_TEST_ADMIN_PASSWORD) {
    const value = process.env.MAKTABATI_TEST_ADMIN_PASSWORD;
    delete process.env.MAKTABATI_TEST_ADMIN_PASSWORD;
    return value;
  }
  if (!process.stdin.isTTY)
    throw new Error(
      "Use an interactive hidden prompt or the server-side setup secret.",
    );
  process.stdout.write("Initial test password (hidden): ");
  return new Promise((resolve, reject) => {
    let password = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const done = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write("\n");
    };
    const onData = (data) => {
      for (const char of data.toString()) {
        if (char === "\u0003") {
          done();
          reject(new Error("Setup cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          done();
          resolve(password);
          return;
        }
        if (char === "\u007f" || char === "\b")
          password = password.slice(0, -1);
        else if (char >= " ") password += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

export function testAdminSql(
  email,
  passwordHash,
  id = randomUUID(),
  credentialId = randomUUID(),
) {
  const q = (v) => "'" + v.replaceAll("'", "''") + "'";
  return `INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,loginName,passwordChangeRequired)
    SELECT ${q(id)},'Private test administrator',${q(email)},1,unixepoch()*1000,unixepoch()*1000,'ADMIN','ADMIN',1
    WHERE NOT EXISTS(SELECT 1 FROM user WHERE role='ADMIN' OR email=${q(email)} OR loginName='ADMIN');
    INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt)
    SELECT ${q(credentialId)},id,'credential',id,${q(passwordHash)},unixepoch()*1000,unixepoch()*1000 FROM user WHERE id=${q(id)};
    INSERT INTO audit_log(actor_id,action,entity,entity_id,details)
    SELECT 'bootstrap-cli','admin.test-bootstrap','user',id,'{}' FROM user WHERE id=${q(id)};
    SELECT id,email,role,loginName,passwordChangeRequired FROM user WHERE role='ADMIN';`;
}
