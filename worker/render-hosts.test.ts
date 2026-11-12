import { expect, test } from "bun:test";
import { parseRenderHosts, SUGGESTED_RENDER_HOSTS } from "./render-hosts";

test("keeps exact public hostnames, normalised", () => {
  const { hosts, rejected } = parseRenderHosts(" WWW.YouTube.com , open.spotify.com,, x.com. ");
  expect([...hosts]).toEqual(["www.youtube.com", "open.spotify.com", "x.com"]);
  expect(rejected).toEqual([]);
});

test("refuses wildcards, schemes, ports, paths, IPs and internal names", () => {
  const { hosts, rejected } = parseRenderHosts("*.youtube.com,https://x.com,x.com:8443,x.com/path,127.0.0.1,localhost,printer.local,api.internal,user@x.com,com");
  expect(hosts.size).toBe(0);
  expect(rejected.length).toBe(10);
});

test("international names become punycode", () => {
  expect([...parseRenderHosts("bücher.example").hosts]).toEqual(["xn--bcher-kva.example"]);
});

test("the suggested list is itself valid", () => {
  const { hosts, rejected } = parseRenderHosts(SUGGESTED_RENDER_HOSTS.join(","));
  expect(rejected).toEqual([]);
  expect(hosts.size).toBe(SUGGESTED_RENDER_HOSTS.length);
});
