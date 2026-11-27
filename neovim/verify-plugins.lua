-- lazy.nvim can report failures without returning a failing process status.
-- Fail activation if plugin tasks fail or commits differ from Gallatin's lock.
local ok, err = pcall(function()
  local config = require("lazy.core.config")
  local git = require("lazy.manage.git")
  local lock = vim.json.decode(table.concat(vim.fn.readfile(vim.env.GALLATIN_LAZYVIM_LOCKFILE), "\n"))

  for name, plugin in pairs(config.plugins) do
    if plugin.url then
      local expected = lock[name]
      local actual = git.info(plugin.dir)
      assert(expected and actual and actual.commit == expected.commit, "Plugin differs from shared lockfile: " .. name)
      for _, task in ipairs(plugin._.tasks or {}) do
        assert(not task:has_errors(), "Plugin task failed: " .. name)
      end
    end
  end
end)

if not ok then
  vim.api.nvim_err_writeln(tostring(err))
  vim.cmd("cquit 1")
end
