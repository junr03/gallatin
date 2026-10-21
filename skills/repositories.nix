{
  mattpocock = {
    source = builtins.fetchGit {
      url = "https://github.com/junr03/skills.git";
      rev = "08a794c2ebbb91a544c47b026178c509e004880f";
    };
    directories = [ "skills" ];
  };
}
