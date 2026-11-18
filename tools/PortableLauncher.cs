using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class PortableLauncher
{
    private const int Port = 8769;
    private const string Address = "http://127.0.0.1:8769/";
    private const string SecurityPolicy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'";
    private static readonly Dictionary<string, byte[]> Files = new Dictionary<string, byte[]>(StringComparer.Ordinal);
    private static TcpListener listener;
    private static readonly List<TcpListener> Networks = new List<TcpListener>();
    private static readonly object RoomLock = new object();
    private sealed class Match
    {
        public string Guest;
        public readonly Queue<string> Inputs = new Queue<string>();
        public byte[] Frame;
        public int FrameNumber;
        public bool GuestTurn;
        public bool Streaming;
        public DateTime Updated = DateTime.UtcNow;
        public readonly Seat Host = new Seat("0", "ff00ff00");
        public readonly Seat Visitor = new Seat("0", "ff0000ff");
        public bool Started;
    }
    private sealed class Seat
    {
        public string Vote, Color;
        public bool Ready;
        public DateTime Seen;
        public Seat(string vote, string color) { Vote = vote; Color = color; }
        public bool Connected { get { return DateTime.UtcNow - Seen < TimeSpan.FromSeconds(12); } }
        public void Touch() { if (!Connected) Ready = false; Seen = DateTime.UtcNow; }
    }
    private static readonly Dictionary<string, Match> Rooms = new Dictionary<string, Match>();

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool first;
        using (var instance = new Mutex(true, "Local\\BattalionPortableLauncher", out first))
        {
            if (!first)
            {
                OpenBrowser();
                return;
            }
            try
            {
                LoadFiles();
                listener = new TcpListener(IPAddress.Loopback, Port);
                listener.Server.ExclusiveAddressUse = true;
                listener.Start();
                listener.BeginAcceptTcpClient(Accept, listener);
                if (Array.IndexOf(args, "--lan") >= 0) EnableLan();
                using (var window = new Form())
                {
                    window.Text = "Battalion";
                    window.ClientSize = new Size(388, 159);
                    window.FormBorderStyle = FormBorderStyle.FixedDialog;
                    window.MaximizeBox = false;
                    window.StartPosition = FormStartPosition.CenterScreen;
                    var text = new Label { Text = "Mantenha esta janela aberta enquanto joga.", Left = 18, Top = 19, Width = 350 };
                    var browser = new Button { Text = "Abrir Battalion", Left = 18, Top = 56, Width = 160, Height = 34 };
                    var close = new Button { Text = "Encerrar", Left = 202, Top = 56, Width = 160, Height = 34 };
                    browser.Click += delegate { OpenBrowser(); };
                    close.Click += delegate { window.Close(); };
                    var lan = new Button { Text = "Ativar rede local (LAN)", Left = 18, Top = 99, Width = 345, Height = 34 };
                    if (Networks.Count > 0)
                    {
                        lan.Text = "Rede local ativa";
                        lan.Enabled = false;
                    }
                    lan.Click += delegate {
                        try {
                            EnableLan();
                            lan.Text = "Rede local ativa";
                            lan.Enabled = false;
                            OpenBrowser();
                        } catch (Exception error) { MessageBox.Show(error.Message, "Rede local"); }
                    };
                    window.Controls.AddRange(new Control[] { text, browser, close, lan });
                    window.Shown += delegate { OpenBrowser(); };
                    Application.Run(window);
                }
            }
            catch (Exception error)
            {
                MessageBox.Show("Falha ao iniciar o Battalion. " + error.Message, "Battalion", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                if (listener != null) listener.Stop();
                foreach (var service in Networks) service.Stop();
            }
        }
    }

    private static void EnableLan()
    {
        if (Networks.Count > 0) return;
        var failures = new List<string>();
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up) continue;
            bool radmin = (nic.Name + " " + nic.Description).IndexOf("Radmin", StringComparison.OrdinalIgnoreCase) >= 0;
            foreach (var binding in nic.GetIPProperties().UnicastAddresses)
            {
                if (!PrivateAddress(binding.Address) && !(radmin && RadminAddress(binding.Address))) continue;
                try
                {
                    var service = new TcpListener(binding.Address, Port);
                    service.Start();
                    Networks.Add(service);
                    service.BeginAcceptTcpClient(Accept, service);
                }
                catch (SocketException) { failures.Add(binding.Address.ToString()); }
            }
        }
        if (Networks.Count == 0) throw new InvalidOperationException(failures.Count > 0 ?
            "Não foi possível abrir a porta 8769 em " + string.Join(", ", failures) + "." :
            "Conecte-se à rede local ou ative o adaptador Radmin VPN.");
    }

    private static bool RadminAddress(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        return bytes.Length == 4 && bytes[0] == 26;
    }

    private static bool PrivateAddress(IPAddress address)
    {
        var a = address.GetAddressBytes();
        return a.Length == 4 && (a[0] == 10 || (a[0] == 192 && a[1] == 168) || (a[0] == 172 && a[1] >= 16 && a[1] <= 31));
    }

    private static void OpenBrowser()
    {
        try { Process.Start(new ProcessStartInfo(Address) { UseShellExecute = true }); }
        catch { MessageBox.Show("Abra " + Address + " em um navegador.", "Battalion"); }
    }

    private static void LoadFiles()
    {
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("BattalionAssets"))
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
        {
            foreach (var entry in archive.Entries)
            {
                using (var source = entry.Open())
                using (var bytes = new MemoryStream())
                {
                    source.CopyTo(bytes);
                    Files.Add("/" + entry.FullName, bytes.ToArray());
                }
            }
        }
    }

    private static void Accept(IAsyncResult pending)
    {
        TcpClient client;
        var service = (TcpListener)pending.AsyncState;
        bool local = service == listener;
        try
        {
            client = service.EndAcceptTcpClient(pending);
            service.BeginAcceptTcpClient(Accept, service);
        }
        catch (SocketException) { return; }
        catch (ObjectDisposedException) { return; }

        using (client)
        {
            try
            {
                var bound = ((IPEndPoint)client.Client.LocalEndPoint).Address;
                var peer = ((IPEndPoint)client.Client.RemoteEndPoint).Address;
                if (!local && !(RadminAddress(bound) ? RadminAddress(peer) : PrivateAddress(peer))) return;
                client.ReceiveTimeout = 3000;
                client.SendTimeout = 5000;
                client.NoDelay = true;
                using (var stream = client.GetStream())
                {
                    var request = ReadHeaders(stream).Split(new[] { "\r\n" }, StringSplitOptions.None);
                    var first = request[0].Split(' ');
                    if (first.Length != 3) return;
                    var host = bound.ToString();
                    if (!Array.Exists(request, h => h.Equals("Host: " + host + ":" + Port, StringComparison.OrdinalIgnoreCase))) return;
                    var path = first[1].Split('?')[0];
                    if (path.StartsWith("/lan/", StringComparison.Ordinal))
                    {
                        var origin = Array.Find(request, h => h.StartsWith("Origin:", StringComparison.OrdinalIgnoreCase));
                        if (origin != null && origin.Substring(7).Trim() != "http://" + host + ":" + Port) return;
                        ServeLan(stream, request, first[0], path, local);
                        return;
                    }
                    if (first[0] != "GET" && first[0] != "HEAD") return;
                    if (!local && path == "/runtime/ruffle.js") {
                        WriteEmpty(stream);
                        return;
                    }
                    if (!local && path != "/" && path != "/launcher.css" && path != "/cenarios.js" &&
                        path != "/lan.js" && path != "/swf-map.js" && path != "/camera.js") return;
                    if (path == "/") path = "/index.html";
                    byte[] content;
                    var found = Files.TryGetValue(path, out content);
                    var header = "HTTP/1.1 " + (found ? "200 OK" : "404 Not Found") +
                        "\r\nConnection: close\r\nContent-Type: " + Mime(path) +
                        "\r\nContent-Length: " + (found ? content.Length : 0) +
                        "\r\nCache-Control: no-store\r\nX-Battalion-Portable: 1\r\nContent-Security-Policy: " + SecurityPolicy + "\r\n\r\n";
                    var bytes = Encoding.ASCII.GetBytes(header);
                    stream.Write(bytes, 0, bytes.Length);
                    if (found && first[0] == "GET") stream.Write(content, 0, content.Length);
                }
            }
            catch (IOException) { }
            catch (SocketException) { }
        }
    }

    private static string Token() { return Guid.NewGuid().ToString("N").Substring(0,24); }
    private static byte[] Text(string value) { return Encoding.UTF8.GetBytes(value); }
    private static string BooleanJson(bool value) { return value ? "true" : "false"; }
    private static string SeatJson(Seat seat)
    {
        return "{\"connected\":" + BooleanJson(seat.Connected) + ",\"ready\":" +
            BooleanJson(seat.Connected && seat.Ready) + ",\"vote\":" + seat.Vote + ",\"color\":\"" + seat.Color + "\"}";
    }
    private static byte[] LobbyJson(Match match)
    {
        return Text("{\"started\":" + BooleanJson(match.Started) + ",\"host\":" + SeatJson(match.Host) +
            ",\"guest\":" + SeatJson(match.Visitor) + ",\"map\":" + match.Host.Vote + "}");
    }

    private static bool IsColor(string value)
    {
        return Array.IndexOf(new[] {"ff00ff00","ff0000ff","ffff0000","ffffd800","ffffa500","ff5645a0","fff5f5ff","ff008080"}, value) >= 0;
    }

    private static void WriteEmpty(Stream stream)
    {
        var headers = Text("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        stream.Write(headers,0,headers.Length);
    }

    private static void ServeLan(Stream stream, string[] headers, string verb, string path, bool local)
    {
        var parts = path.Substring(5).Split('/');
        if (!local && verb == "GET" && parts.Length == 3 && parts[0] == "stream")
        {
            StreamFrames(stream, parts[1], parts[2]);
            return;
        }
        var content = new byte[0];
        var type = "text/plain; charset=utf-8";
        var status = "404 Not Found";
        byte[] upload = null;
        if (verb == "POST")
        {
            var size = Array.Find(headers, h => h.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase));
            int length;
            if (size != null && (!int.TryParse(size.Substring(15).Trim(), out length) || length < 0 || length > 300000)) return;
            length = size == null ? 0 : int.Parse(size.Substring(15).Trim());
            upload = new byte[length];
            int position = 0;
            while (position < length)
            {
                int read = stream.Read(upload, position, length-position);
                if (read == 0) return;
                position += read;
            }
        }
        lock (RoomLock)
        {
            Match match;
            if (local && verb == "POST" && parts.Length == 1 && parts[0] == "create")
            {
                if (Networks.Count == 0)
                {
                    status = "409 Conflict";
                    content = Text("Clique em Ativar rede local na janela do Battalion.exe.");
                }
                else
                {
                    var expired = new List<string>();
                    foreach (var entry in Rooms) if (DateTime.UtcNow - entry.Value.Updated > TimeSpan.FromMinutes(20)) expired.Add(entry.Key);
                    foreach (var key in expired) Rooms.Remove(key);
                    if (Rooms.Count >= 8) {
                        status = "409 Conflict";
                        content = Text("Há muitas salas abertas. Encerre uma partida e tente novamente.");
                    } else {
                    var room = Token();
                    var created = new Match();
                    created.Host.Touch();
                    int initial;
                    if (int.TryParse(Encoding.ASCII.GetString(upload),out initial) && initial >= 0 && initial < 5)
                        created.Host.Vote = initial.ToString();
                    Rooms.Add(room,created);
                    type = "application/json";
                    status = "200 OK";
                    var invites = new List<string>();
                    foreach (var network in Networks)
                    {
                        var address = ((IPEndPoint)network.LocalEndpoint).Address;
                        invites.Add("{\"kind\":\"" + (RadminAddress(address) ? "Radmin VPN" : "Mesma rede") +
                            "\",\"url\":\"http://" + address + ":" + Port + "/?guest=" + room + "\"}");
                    }
                    content = Text("{\"room\":\"" + room + "\",\"invites\":[" + string.Join(",",invites) + "]}");
                    }
                }
            }
            else if (parts.Length >= 2 && Rooms.TryGetValue(parts[1],out match))
            {
                bool visitor = !local && parts.Length == 3 && match.Guest != null && parts[2] == match.Guest;
                Seat seat = local && parts.Length == 2 ? match.Host : visitor ? match.Visitor : null;
                if (local && verb == "POST" && parts.Length == 2 && parts[0] == "close") {
                    Rooms.Remove(parts[1]);
                    Monitor.PulseAll(RoomLock);
                    status = "204 No Content";
                }
                else if (seat != null && parts[0] == "lobby" && verb == "GET")
                {
                    match.Updated = DateTime.UtcNow;
                    seat.Touch();
                    status = "200 OK"; type = "application/json"; content = LobbyJson(match);
                }
                else if (seat != null && parts[0] == "prefs" && verb == "POST" && !match.Started)
                {
                    var values = Encoding.ASCII.GetString(upload).Split(',');
                    int vote;
                    status = "400 Bad Request"; content = Text("Escolha um mapa e uma cor válidos.");
                    if (values.Length == 3 && IsColor(values[0]) && int.TryParse(values[1],out vote) && vote >= 0 && vote < 5 &&
                        (values[2] == "0" || values[2] == "1"))
                    {
                        seat.Touch();
                        bool changed = seat.Color != values[0] || seat.Vote != vote.ToString();
                        seat.Color = values[0]; seat.Vote = vote.ToString(); seat.Ready = !changed && values[2] == "1";
                        if (changed) { match.Host.Ready = false; match.Visitor.Ready = false; }
                        status = "200 OK"; type = "application/json"; content = LobbyJson(match);
                    }
                }
                else if (local && parts.Length == 2 && parts[0] == "start" && verb == "POST")
                {
                    if (match.Started || (match.Host.Connected && match.Visitor.Connected && match.Host.Ready &&
                        match.Visitor.Ready && match.Host.Color != match.Visitor.Color))
                    {
                        match.Started = true;
                        status = "200 OK"; type = "application/json"; content = LobbyJson(match);
                    }
                    else
                    {
                        status = "409 Conflict";
                        content = Text("Os dois jogadores precisam estar conectados, prontos e com cores diferentes.");
                    }
                }
                else if (match.Started && local && verb == "POST" && parts.Length == 3 && parts[0] == "host")
                {
                    match.Updated = DateTime.UtcNow;
                    match.GuestTurn = parts[2] == "1";
                    match.Frame = upload; match.FrameNumber++;
                    Monitor.PulseAll(RoomLock);
                    status = "200 OK";
                    content = Text(match.GuestTurn ? string.Join("\n", match.Inputs.ToArray()) : "");
                    match.Inputs.Clear();
                }
                else if (!local && verb == "POST" && parts.Length == 2 && parts[0] == "join" &&
                    (match.Guest == null || (!match.Started && !match.Visitor.Connected)))
                {
                    match.Guest = Token(); match.Visitor.Touch();
                    status = "200 OK"; content = Text(match.Guest);
                }
                else if (match.Started && !local && parts.Length >= 3 && match.Guest != null && parts[2] == match.Guest)
                {
                    if (verb == "POST" && parts.Length == 3 && parts[0] == "input" && match.GuestTurn && upload.Length <= 15)
                    {
                        var input = Encoding.ASCII.GetString(upload);
                        var xy = input.Split(',');
                        int x, y;
                        bool click = xy.Length == 2 && int.TryParse(xy[0],out x) && int.TryParse(xy[1],out y) &&
                            x >= 0 && x < 700 && y >= 0 && y < 600;
                        bool pan = xy.Length == 3 && xy[0] == "p" && int.TryParse(xy[1],out x) && int.TryParse(xy[2],out y) &&
                            x >= -560 && x <= 560 && y >= -560 && y <= 560;
                        bool zoom = input == "z,-1" || input == "z,1" || input == "z,2";
                        if ((click || pan || zoom) && match.Inputs.Count < 12)
                        {
                            match.Inputs.Enqueue(input);
                            status = "204 No Content";
                        }
                    }
                }
            }
        }
        var bytes = Text("HTTP/1.1 " + status + "\r\nContent-Length: " + content.Length + "\r\nContent-Type: " + type +
            "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
        stream.Write(bytes,0,bytes.Length);
        stream.Write(content,0,content.Length);
    }

    private static void StreamFrames(Stream stream, string room, string seat)
    {
        Match match;
        lock (RoomLock)
        {
            if (!Rooms.TryGetValue(room, out match) || !match.Started || match.Guest != seat || match.Streaming)
            {
                match = null;
            }
            else match.Streaming = true;
        }
        if (match == null)
        {
            WriteEmpty(stream);
            return;
        }
        try
        {
            var headers = Text("HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\n" +
                "X-Content-Type-Options: nosniff\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
            stream.Write(headers, 0, headers.Length);
            var header = new byte[12];
            int sequence = 0;
            while (true)
            {
                byte[] frame;
                bool turn;
                lock (RoomLock)
                {
                    if (sequence == match.FrameNumber) Monitor.Wait(RoomLock, 1000);
                    if (!Rooms.ContainsKey(room)) return;
                    frame = sequence == match.FrameNumber ? null : match.Frame;
                    sequence = match.FrameNumber;
                    turn = match.GuestTurn;
                }
                Array.Copy(BitConverter.GetBytes(frame == null ? 0 : frame.Length), 0, header, 0, 4);
                Array.Copy(BitConverter.GetBytes(sequence), 0, header, 4, 4);
                header[8] = turn ? (byte)1 : (byte)0;
                stream.Write(header, 0, header.Length);
                if (frame != null) stream.Write(frame, 0, frame.Length);
            }
        }
        finally
        {
            lock (RoomLock) match.Streaming = false;
        }
    }

    private static string ReadHeaders(Stream stream)
    {
        var result = new StringBuilder();
        int previous = 0;
        while (result.Length < 8192)
        {
            int next = stream.ReadByte();
            if (next < 0) break;
            previous = (previous << 8) | next;
            result.Append((char)next);
            if (previous == 0x0d0a0d0a) return result.ToString();
        }
        return "";
    }

    private static string Mime(string path)
    {
        switch (Path.GetExtension(path))
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".wasm": return "application/wasm";
            case ".swf": return "application/x-shockwave-flash";
            case ".yimf":
            case ".xml": return "application/xml; charset=utf-8";
            default: return "text/plain; charset=utf-8";
        }
    }
}
