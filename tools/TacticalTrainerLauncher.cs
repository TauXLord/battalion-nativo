// Treinador portátil da IA tática do Battalion: leva Node.js, o jogo e o treino num único .exe.
// O progresso fica em "treino-tatica\treino.json" ao lado do executável, para levar de volta ao PC principal.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

internal static class TacticalTrainerLauncher
{
    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "Battalion · Treino da IA tática";
        var options = new List<string>(args);
        bool pause = !options.Remove("--sem-pausa") && !Console.IsInputRedirected;
        int exitCode = 1;
        try
        {
            string here = AppDomain.CurrentDomain.BaseDirectory;
            string folder = PrepareFiles();
            string state = Path.Combine(here, "treino-tatica");
            if (!HasOption(options, "--pasta"))
            {
                Directory.CreateDirectory(state);
                string checkpoint = Path.Combine(state, "treino.json");
                if (!File.Exists(checkpoint))
                {
                    // Primeiro uso: começa de um treino.json colocado ao lado do .exe ou do checkpoint embutido.
                    string beside = Path.Combine(here, "treino.json");
                    string embedded = Path.Combine(folder, "inicial", "treino.json");
                    if (File.Exists(beside)) File.Copy(beside, checkpoint);
                    else if (File.Exists(embedded)) File.Copy(embedded, checkpoint);
                }
                options.AddRange(new[] { "--pasta", state });
            }
            if (!HasOption(options, "--workers"))
                options.AddRange(new[] { "--workers", Math.Max(1, Environment.ProcessorCount).ToString() });

            Console.WriteLine("Battalion · Treino da IA tática (portátil)");
            Console.WriteLine("Núcleos em uso: " + Environment.ProcessorCount + " · progresso em " + state);
            options.Insert(0, Path.Combine(folder, "tools", "treinar-tatica.mjs"));
            var settings = new ProcessStartInfo(Path.Combine(folder, "runtime", "node.exe"),
                String.Join(" ", options.ConvertAll(Quote).ToArray()))
            {
                WorkingDirectory = here,
                UseShellExecute = false
            };
            settings.EnvironmentVariables.Remove("NODE_OPTIONS");

            // Ctrl+C é tratado pelo treinador (pausa e menu); o launcher só espera.
            ConsoleCancelEventHandler keepRunning = (sender, signal) => { signal.Cancel = true; };
            Console.CancelKeyPress += keepRunning;
            try
            {
                using (var trainer = Process.Start(settings))
                {
                    trainer.WaitForExit();
                    exitCode = trainer.ExitCode;
                }
            }
            finally { Console.CancelKeyPress -= keepRunning; }
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); }
        if (pause)
        {
            Console.WriteLine("Pressione Enter para fechar.");
            Console.ReadLine();
        }
        return exitCode;
    }

    private static bool HasOption(List<string> args, string name)
    {
        return args.Exists(value => value == name || value.StartsWith(name + "=", StringComparison.Ordinal));
    }

    private static string Quote(string argument)
    {
        // Windows requires extra backslashes before literal quotes and before the closing quote.
        return "\"" + Regex.Replace(argument, @"(\\*)(\""|$)", match =>
            match.Groups[1].Value + match.Groups[1].Value + (match.Groups[2].Length == 0 ? "" : "\\\"")) + "\"";
    }

    private static string PrepareFiles()
    {
        using (var package = Assembly.GetExecutingAssembly().GetManifestResourceStream("BattalionTacticalTrainer"))
        using (var sha = SHA256.Create())
        {
            string checksum = BitConverter.ToString(sha.ComputeHash(package)).Replace("-", "").ToLowerInvariant();
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "BattalionTreinadorTatico", checksum);
            string boundary = Path.GetFullPath(folder) + Path.DirectorySeparatorChar;
            package.Position = 0;
            using (var mutex = new Mutex(false, @"Local\BattalionTreinadorTatico-" + checksum))
            using (var archive = new ZipArchive(package, ZipArchiveMode.Read))
            {
                try { mutex.WaitOne(); }
                catch (AbandonedMutexException) { }
                try
                {
                    foreach (var entry in archive.Entries)
                    {
                        string path = Path.GetFullPath(Path.Combine(folder, entry.FullName));
                        if (!path.StartsWith(boundary, StringComparison.OrdinalIgnoreCase))
                            throw new InvalidDataException("Caminho inválido no pacote do treinador.");
                        var cached = new FileInfo(path);
                        if (cached.Exists && cached.Length == entry.Length) continue;
                        Directory.CreateDirectory(Path.GetDirectoryName(path));
                        entry.ExtractToFile(path, true);
                    }
                }
                finally { mutex.ReleaseMutex(); }
            }
            return folder;
        }
    }
}
