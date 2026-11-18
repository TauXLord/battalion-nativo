using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

internal static class NativeLauncher
{
    private const string PayloadName = "BattalionNative";

    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "Battalion Nativo";
        bool noBrowser = Array.IndexOf(args, "--no-browser") >= 0;
        bool internet = Array.IndexOf(args, "--internet") >= 0;
        try
        {
            string portText = Environment.GetEnvironmentVariable("BATTALION_NATIVE_PORT");
            int port = 8770;
            if (!String.IsNullOrEmpty(portText) &&
                (!Int32.TryParse(portText, out port) || port < 1 || port > 65535))
                throw new InvalidOperationException("Porta inválida para o Battalion.");
            string checksum = PayloadChecksum();
            int preferredPort = port;
            for (; port <= Math.Min(preferredPort + 19, 65535); port++)
            {
                if (ReuseServer(port, checksum, internet, noBrowser)) return 0;
                if (!PortAvailable(port)) continue;
                bool first;
                using (var instance = new Mutex(true, @"Local\BattalionNative-" + port, out first))
                {
                    if (!first)
                    {
                        for (int attempt = 0; attempt < 20; attempt++)
                        {
                            if (ReuseServer(port, checksum, internet, noBrowser)) return 0;
                            Thread.Sleep(200);
                        }
                        continue;
                    }
                    if (port != preferredPort)
                        Console.WriteLine("Porta " + preferredPort + " ocupada. Abrindo o Battalion atualizado na porta " + port + ".");
                    return RunServer(port, checksum, internet, noBrowser);
                }
            }
            throw new InvalidOperationException("Não encontrei uma porta livre para abrir o Battalion Nativo.");
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            if (!noBrowser && !Console.IsInputRedirected)
            {
                Console.WriteLine("Pressione Enter para fechar.");
                Console.ReadLine();
            }
            return 1;
        }
    }

    private static int RunServer(int port, string checksum, bool internet, bool noBrowser)
    {
        Console.WriteLine("Preparando o Battalion Nativo...");
        string folder;
        using (var extraction = new Mutex(false, @"Local\BattalionNativeExtraction"))
        {
            try { extraction.WaitOne(); }
            catch (AbandonedMutexException) { }
            try { folder = PrepareFiles(checksum); }
            finally { extraction.ReleaseMutex(); }
        }
        var settings = new ProcessStartInfo(Path.Combine(folder, "runtime", "node.exe"),
            @"nativo\servidor.js --lan" + (internet ? " --internet" : "") +
            (noBrowser ? "" : " --open"))
        {
            WorkingDirectory = folder,
            UseShellExecute = false
        };
        settings.EnvironmentVariables.Remove("NODE_OPTIONS");
        settings.EnvironmentVariables["BATTALION_NATIVE_PORT"] = port.ToString();
        settings.EnvironmentVariables["BATTALION_NATIVE_BUILD"] = checksum;
        // Caminho deste executável, usado só pelo botão "Desinstalar" do jogo.
        settings.EnvironmentVariables["BATTALION_NATIVE_EXE"] = Assembly.GetExecutingAssembly().Location;
        Console.WriteLine("Mantenha esta janela aberta enquanto estiver jogando ou hospedando.");
        using (var server = Process.Start(settings))
        {
            server.WaitForExit();
            if (server.ExitCode == 0 || ReuseServer(port, checksum, internet, noBrowser)) return 0;
        }
        throw new InvalidOperationException("O servidor parou. Confira a mensagem acima.");
    }

    private static bool PortAvailable(int port)
    {
        var listener = new TcpListener(IPAddress.Loopback, port);
        try
        {
            listener.ExclusiveAddressUse = true;
            listener.Start();
            return true;
        }
        catch (SocketException) { return false; }
        finally { listener.Stop(); }
    }

    private static string ReadLocal(string address)
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(address);
            request.Proxy = null;
            request.AllowAutoRedirect = false;
            request.Timeout = 700;
            request.ReadWriteTimeout = 700;
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
            {
                if (response.StatusCode != HttpStatusCode.OK) return "";
                char[] buffer = new char[4096];
                int count = reader.ReadBlock(buffer, 0, buffer.Length);
                return new string(buffer, 0, count);
            }
        }
        catch (WebException) { return ""; }
        catch (IOException) { return ""; }
    }

    private static bool ReuseServer(int port, string checksum, bool internet, bool noBrowser)
    {
        string address = "http://127.0.0.1:" + port;
        string path = "/";
        string[] info = ReadLocal(address + "/launcher-status").Split('\n');
        if (info.Length != 4 || info[0] != "Battalion-Nativo/2" || info[3] != checksum ||
            (internet && info[1] != "internet")) return false;
        if (Regex.IsMatch(info[2], @"\A/(?:\?host=[a-f0-9]{24})?\z")) path = info[2];
        string url = address + path;
        Console.WriteLine("O Battalion já está rodando. Abra " + url);
        if (!noBrowser) OpenAppWindow(url);
        return true;
    }

    // Janela de aplicativo (sem barra de endereço) no navegador padrão, quando ele tem o modo --app.
    private static void OpenAppWindow(string url)
    {
        string browser = null;
        try
        {
            using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice"))
            {
                string id = (key == null ? null : key.GetValue("ProgId") as string) ?? "";
                string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string programs = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                string programs86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
                string[] paths =
                    id.StartsWith("ChromeHTML", StringComparison.OrdinalIgnoreCase) ? new[] {
                        Path.Combine(programs, @"Google\Chrome\Application\chrome.exe"),
                        Path.Combine(programs86, @"Google\Chrome\Application\chrome.exe"),
                        Path.Combine(local, @"Google\Chrome\Application\chrome.exe") } :
                    id.StartsWith("MSEdge", StringComparison.OrdinalIgnoreCase) ? new[] {
                        Path.Combine(programs86, @"Microsoft\Edge\Application\msedge.exe"),
                        Path.Combine(programs, @"Microsoft\Edge\Application\msedge.exe") } :
                    id.StartsWith("BraveHTML", StringComparison.OrdinalIgnoreCase) ? new[] {
                        Path.Combine(programs, @"BraveSoftware\Brave-Browser\Application\brave.exe"),
                        Path.Combine(local, @"BraveSoftware\Brave-Browser\Application\brave.exe") } :
                    new string[0];
                foreach (string path in paths) if (File.Exists(path)) { browser = path; break; }
            }
        }
        catch { }
        try
        {
            if (browser != null)
                Process.Start(new ProcessStartInfo(browser, "--app=\"" + url + "\" --window-size=1280,860") { UseShellExecute = false });
            else
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch { }
    }

    private static string PayloadChecksum()
    {
        using (var payload = Assembly.GetExecutingAssembly().GetManifestResourceStream(PayloadName))
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(payload)).Replace("-", "").ToLowerInvariant();
    }

    private static string PrepareFiles(string checksum)
    {
        using (var payload = Assembly.GetExecutingAssembly().GetManifestResourceStream(PayloadName))
        {
            string root = Path.GetFullPath(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BattalionNativo"));
            Directory.CreateDirectory(root);
            string target = Path.Combine(root, checksum);
            if (File.Exists(Path.Combine(target, "runtime", "node.exe")) &&
                File.Exists(Path.Combine(target, "nativo", "servidor.js"))) return target;

            string staging = Path.Combine(root, Guid.NewGuid().ToString("n"));
            Directory.CreateDirectory(staging);
            try
            {
                string boundary = staging + Path.DirectorySeparatorChar;
                payload.Position = 0;
                using (var archive = new ZipArchive(payload, ZipArchiveMode.Read))
                {
                    foreach (var entry in archive.Entries)
                    {
                        string path = Path.GetFullPath(Path.Combine(staging, entry.FullName));
                        if (!path.StartsWith(boundary, StringComparison.OrdinalIgnoreCase))
                            throw new InvalidDataException("O pacote do Battalion tem um caminho inválido.");
                        Directory.CreateDirectory(Path.GetDirectoryName(path));
                        entry.ExtractToFile(path);
                    }
                }
                if (Directory.Exists(target)) Directory.Delete(target, true);
                Directory.Move(staging, target);
                return target;
            }
            finally
            {
                if (Directory.Exists(staging)) Directory.Delete(staging, true);
            }
        }
    }
}
