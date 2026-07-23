/* Minimal SMTP client (zero dependencies).
   Supports: port 465 (implicit TLS), port 587/25 (STARTTLS), AUTH LOGIN,
   and plain unencrypted relays (set starttls:false — local relays only).
   Good enough for transactional lead notifications via Gmail/Zoho/SES-SMTP etc. */
"use strict";

const net = require("net");
const tls = require("tls");

function sendMail(opts, mail) {
  // opts: {host, port, user, pass, timeout?}
  // mail: {from, to, replyTo?, subject, text}
  return new Promise((resolve, reject) => {
    const port = Number(opts.port || 587);
    const secure = port === 465;
    const timeout = opts.timeout || 15000;
    let socket = null;
    let buffer = "";
    let done = false;

    const fail = (err) => { if (!done) { done = true; try { socket && socket.destroy(); } catch (_) {} reject(err); } };
    const ok = () => { if (!done) { done = true; try { socket && socket.end(); } catch (_) {} resolve(); } };

    // The conversation as a queue of steps. Each step: [linesToSend, expectCode]
    const from = mail.from.match(/<([^>]+)>/) ? mail.from.match(/<([^>]+)>/)[1] : mail.from;
    const rcpts = (Array.isArray(mail.to) ? mail.to : [mail.to]).map(String);

    function headers() {
      const now = new Date().toUTCString();
      const h = [
        "From: " + mail.from,
        "To: " + rcpts.join(", "),
        "Subject: " + (mail.subject || "").replace(/[\r\n]/g, " "),
        "Date: " + now,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="utf-8"',
        "Content-Transfer-Encoding: 8bit"
      ];
      if (mail.replyTo) h.push("Reply-To: " + String(mail.replyTo).replace(/[\r\n]/g, " "));
      return h.join("\r\n");
    }
    const body = headers() + "\r\n\r\n" + (mail.text || "").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..") + "\r\n.";

    let steps = [];
    function buildSteps(afterTls) {
      steps = [["EHLO localhost", 250]];
      if (!secure && !afterTls && opts.starttls !== false) steps.push(["STARTTLS", 220, "upgrade"]);
      else {
        if (opts.user) {
          steps.push(["AUTH LOGIN", 334]);
          steps.push([Buffer.from(opts.user).toString("base64"), 334]);
          steps.push([Buffer.from(opts.pass).toString("base64"), 235]);
        }
        steps.push(["MAIL FROM:<" + from + ">", 250]);
        rcpts.forEach((r) => steps.push(["RCPT TO:<" + r + ">", 250]));
        steps.push(["DATA", 354]);
        steps.push([body, 250]);
        steps.push(["QUIT", 221, "quit"]);
      }
    }

    let expectingGreeting = true;

    function attach(sock) {
      socket = sock;
      socket.setTimeout(timeout, () => fail(new Error("SMTP timeout")));
      socket.on("error", fail);
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        // process complete lines; final line of a reply has "NNN " (space after code)
        let idx;
        while ((idx = buffer.indexOf("\r\n")) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (/^\d{3}-/.test(line)) continue; // multiline reply, keep reading
          const code = parseInt(line.slice(0, 3), 10);
          if (expectingGreeting) {
            if (code !== 220) return fail(new Error("SMTP greeting failed: " + line));
            expectingGreeting = false;
            buildSteps(false);
            return send();
          }
          handle(code, line);
        }
      });
    }

    let current = null;
    function send() {
      current = steps.shift();
      if (!current) return ok();
      socket.write(current[0] + "\r\n");
    }
    function handle(code, line) {
      if (!current) return;
      const [, expect, action] = current;
      if (code !== expect) return fail(new Error('SMTP error after "' + String(current[0]).slice(0, 20) + '…": ' + line));
      if (action === "upgrade") {
        // wrap existing socket in TLS, then restart conversation (post-TLS EHLO)
        socket.removeAllListeners();
        const tlsSock = tls.connect({ socket, host: opts.host, servername: opts.host }, () => {
          buffer = "";
          expectingGreeting = false;
          buildSteps(true);
          attachTls(tlsSock);
          send();
        });
        tlsSock.on("error", fail);
        return;
      }
      if (action === "quit") return ok();
      send();
    }
    function attachTls(sock) {
      socket = sock;
      socket.setTimeout(timeout, () => fail(new Error("SMTP timeout")));
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let idx;
        while ((idx = buffer.indexOf("\r\n")) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (/^\d{3}-/.test(line)) continue;
          handle(parseInt(line.slice(0, 3), 10), line);
        }
      });
    }

    if (secure) {
      const s = tls.connect({ host: opts.host, port, servername: opts.host }, () => {});
      attach(s);
    } else {
      const s = net.connect({ host: opts.host, port }, () => {});
      attach(s);
    }
  });
}

module.exports = { sendMail };
