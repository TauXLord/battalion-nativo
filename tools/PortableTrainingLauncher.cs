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

internal static class PortableTrainingLauncher
{
    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        var options = new List<string>(args);
        bool pause = !options.Remove("--sem-pausa") && !Console.IsInputRedirected;
        int exitCode = 1;
        try
        {
#if TREINO_DO_ZERO
            if (!HasOption(options, "--do-zero"))
                options.Add("--do-zero");
#endif
            bool evaluation = HasOption(options, "--validar") || HasOption(options, "--ativar");
            bool trains = !evaluation && !HasOption(options, "--desativar") && !HasOption(options, "--ajuda");
            if (evaluation && !HasOption(options, "--horas"))
                options.AddRange(new[] { "--horas", "0" });
            if (trains && !HasOption(options, "--exportar"))
                options.AddRange(new[] { "--exportar", Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ia.json") });
            if (!HasOption(options, "--workers"))
            {
                int workers = Math.Max(1, Math.Min(evaluation ? 16 : 40, Environment.ProcessorCount - 1));
                options.AddRange(new[] { "--workers", workers.ToString() });
            }

            string folder = PrepareFiles();
            options.Insert(0, Path.Combine(folder, "tools", "treinar-ia.mjs"));
            var settings = new ProcessStartInfo(Path.Combine(folder, "runtime", "node.exe"),
                String.Join(" ", options.ConvertAll(Quote).ToArray()))
            {
                WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory,
                UseShellExecute = false
            };
            settings.EnvironmentVariables.Remove("NODE_OPTIONS");

            ConsoleCancelEventHandler preserveCheckpoint = (sender, signal) => { signal.Cancel = true; };
            Console.CancelKeyPress += preserveCheckpoint;
            try
            {
                using (var trainer = Process.Start(settings))
                {
                    trainer.WaitForExit();
                    exitCode = trainer.ExitCode;
                }
            }
            finally { Console.CancelKeyPress -= preserveCheckpoint; }
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
        using (var package = Assembly.GetExecutingAssembly().GetManifestResourceStream("BattalionTrainer"))
        using (var sha = SHA256.Create())
        {
            string checksum = BitConverter.ToString(sha.ComputeHash(package)).Replace("-", "").ToLowerInvariant();
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "BattalionTreinador", checksum);
            string boundary = Path.GetFullPath(folder) + Path.DirectorySeparatorChar;
            package.Position = 0;
            using (var mutex = new Mutex(false, @"Local\BattalionTreinador-" + checksum))
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
